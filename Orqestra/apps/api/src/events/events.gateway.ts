import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

export type JobEventType =
  | 'job.created'
  | 'job.claimed'
  | 'job.completed'
  | 'job.failed'
  | 'job.dlq'
  | 'job.cancelled'
  | 'job.retried';

export type QueueEventType =
  | 'queue.paused'
  | 'queue.resumed'
  | 'queue.stats';

export type WorkerEventType =
  | 'worker.heartbeat'
  | 'worker.unhealthy'
  | 'worker.registered'
  | 'worker.offline';

@WebSocketGateway({
  namespace: '/events',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  afterInit(server: Server) {
    this.logger.log('WebSocket gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  /** Client subscribes to events for a specific project */
  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() data: { projectId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data?.projectId) {
      client.join(`project:${data.projectId}`);
      this.logger.debug(`Client ${client.id} subscribed to project:${data.projectId}`);
      return { event: 'subscribed', data: { projectId: data.projectId } };
    }
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @MessageBody() data: { projectId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data?.projectId) {
      client.leave(`project:${data.projectId}`);
    }
  }

  /** Emit a job state change event to all subscribers of the queue's project */
  emitJobEvent(event: JobEventType, job: any) {
    const payload = { event, data: job, timestamp: new Date() };
    // Broadcast globally — in production scope to project rooms
    this.server.emit(event, payload);
    this.logger.debug(`Emitted ${event} for job ${job?.id}`);
  }

  emitQueueEvent(event: QueueEventType, queue: any) {
    const payload = { event, data: queue, timestamp: new Date() };
    this.server.emit(event, payload);
  }

  emitWorkerEvent(event: WorkerEventType, worker: any) {
    const payload = { event, data: worker, timestamp: new Date() };
    this.server.emit(event, payload);
  }
}
