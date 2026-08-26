import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { Job, JobStatus, JobType } from './entities/job.entity';
import { JobExecution } from './entities/job-execution.entity';
import { JobLog } from './entities/job-log.entity';
import { ScheduledJob } from './entities/scheduled-job.entity';
import { BatchJob } from './entities/batch-job.entity';
import { Queue } from '../queues/entities/queue.entity';
import { DeadLetterEntry } from '../dlq/entities/dead-letter-entry.entity';
import { EventsGateway } from '../events/events.gateway';

describe('JobsService State Machine', () => {
  let service: JobsService;
  let jobsRepoMock: any;

  const mockEventsGateway = {
    emitJobEvent: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn(),
  };

  beforeEach(async () => {
    jobsRepoMock = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: getRepositoryToken(Job), useValue: jobsRepoMock },
        { provide: getRepositoryToken(JobExecution), useValue: {} },
        { provide: getRepositoryToken(JobLog), useValue: {} },
        { provide: getRepositoryToken(ScheduledJob), useValue: {} },
        { provide: getRepositoryToken(BatchJob), useValue: {} },
        { provide: getRepositoryToken(Queue), useValue: {} },
        { provide: getRepositoryToken(DeadLetterEntry), useValue: {} },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: EventsGateway, useValue: mockEventsGateway },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  describe('cancel', () => {
    it('should successfully cancel a queued job', async () => {
      const mockJob = {
        id: 'job-1',
        status: JobStatus.QUEUED,
      };
      jobsRepoMock.findOne.mockResolvedValue(mockJob);
      jobsRepoMock.save.mockImplementation((x: any) => Promise.resolve(x));

      const result = await service.cancel('job-1');

      expect(result.status).toBe(JobStatus.CANCELLED);
      expect(jobsRepoMock.save).toHaveBeenCalledWith(mockJob);
      expect(mockEventsGateway.emitJobEvent).toHaveBeenCalledWith('job.cancelled', result);
    });

    it('should throw ConflictException if job is already running', async () => {
      const mockJob = {
        id: 'job-2',
        status: JobStatus.RUNNING,
      };
      jobsRepoMock.findOne.mockResolvedValue(mockJob);

      await expect(service.cancel('job-2')).rejects.toThrow(ConflictException);
    });
  });

  describe('retry', () => {
    it('should reset attempts and set status to queued for failed job', async () => {
      const mockJob = {
        id: 'job-3',
        status: JobStatus.FAILED,
        attempts: 3,
        workerId: 'worker-1',
        claimedAt: new Date(),
      };
      jobsRepoMock.findOne.mockResolvedValue(mockJob);
      jobsRepoMock.save.mockImplementation((x: any) => Promise.resolve(x));

      const result = await service.retry('job-3');

      expect(result.status).toBe(JobStatus.QUEUED);
      expect(result.attempts).toBe(0);
      expect(result.workerId).toBeNull();
      expect(result.claimedAt).toBeNull();
      expect(mockEventsGateway.emitJobEvent).toHaveBeenCalledWith('job.retried', result);
    });
  });
});
