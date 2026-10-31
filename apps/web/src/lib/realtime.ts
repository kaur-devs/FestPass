import {
  RealtimeMessage,
  type SalesUpdatedMessage,
  type SeatsUpdatedMessage,
  type SubscribeRequest,
  type TiersUpdatedMessage,
} from '@festpass/shared';
import { io, type Socket } from 'socket.io-client';
import { useEffect, useEffectEvent, useState } from 'react';
import { API_URL } from './api';

let socket: Socket | undefined;

function getSocket(): Socket {
  socket ??= io(API_URL, { withCredentials: true, transports: ['websocket'] });
  return socket;
}

interface Listeners {
  [RealtimeMessage.SeatsUpdated]?: (message: SeatsUpdatedMessage) => void;
  [RealtimeMessage.TiersUpdated]?: (message: TiersUpdatedMessage) => void;
  [RealtimeMessage.SalesUpdated]?: (message: SalesUpdatedMessage) => void;
}

function useChannel(subscription: SubscribeRequest, listeners: Listeners, onResync?: () => void) {
  const { channel, eventId } = subscription;
  const [connected, setConnected] = useState(false);

  const onSeats = useEffectEvent((message: SeatsUpdatedMessage) => {
    listeners[RealtimeMessage.SeatsUpdated]?.(message);
  });
  const onTiers = useEffectEvent((message: TiersUpdatedMessage) => {
    listeners[RealtimeMessage.TiersUpdated]?.(message);
  });
  const onSales = useEffectEvent((message: SalesUpdatedMessage) => {
    listeners[RealtimeMessage.SalesUpdated]?.(message);
  });
  const resync = useEffectEvent(() => onResync?.());

  useEffect(() => {
    const client = getSocket();
    const request = { channel, eventId };
    const subscribe = () => {
      setConnected(true);
      client.emit('subscribe', request);
    };
    const markDisconnected = () => {
      setConnected(false);
    };
    const reconnected = () => {
      resync();
    };
    const seatsUpdated = (message: SeatsUpdatedMessage) => {
      onSeats(message);
    };
    const tiersUpdated = (message: TiersUpdatedMessage) => {
      onTiers(message);
    };
    const salesUpdated = (message: SalesUpdatedMessage) => {
      onSales(message);
    };

    if (client.connected) subscribe();
    client.on('connect', subscribe);
    client.on('disconnect', markDisconnected);
    client.io.on('reconnect', reconnected);
    client.on(RealtimeMessage.SeatsUpdated, seatsUpdated);
    client.on(RealtimeMessage.TiersUpdated, tiersUpdated);
    client.on(RealtimeMessage.SalesUpdated, salesUpdated);

    return () => {
      client.emit('unsubscribe', request);
      client.off('connect', subscribe);
      client.off('disconnect', markDisconnected);
      client.io.off('reconnect', reconnected);
      client.off(RealtimeMessage.SeatsUpdated, seatsUpdated);
      client.off(RealtimeMessage.TiersUpdated, tiersUpdated);
      client.off(RealtimeMessage.SalesUpdated, salesUpdated);
    };
  }, [channel, eventId]);

  return { connected };
}

export function useEventUpdates(
  eventId: string,
  listeners: Pick<
    Listeners,
    typeof RealtimeMessage.SeatsUpdated | typeof RealtimeMessage.TiersUpdated
  >,
  onResync?: () => void,
) {
  return useChannel({ channel: 'event', eventId }, listeners, onResync);
}

export function useSalesUpdates(eventId: string, onSales: () => void) {
  return useChannel(
    { channel: 'manage', eventId },
    { [RealtimeMessage.SalesUpdated]: onSales },
    onSales,
  );
}
