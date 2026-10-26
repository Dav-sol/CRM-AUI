import {
  mapPancakeWebhookEvent,
  type PancakeWebhookEnvelope,
} from './pancake.webhook.inbound';

const PSID = 'tt_6570511458700967938';
const PHONE = '+573001112233';
const CONV = 'tt_0:1:6570511458700967938:6711731671916708866';

function phoneIndex(entries: Array<[string, string]> = [[PSID, PHONE]]) {
  return { phoneByPsid: new Map<string, string>(entries) };
}

/** Sobre equivalente al ejemplo publicado en el contrato oficial. */
function validEnvelope(
  overrides: Partial<NonNullable<PancakeWebhookEnvelope['data']>> = {},
  envelope: Partial<PancakeWebhookEnvelope> = {},
): PancakeWebhookEnvelope {
  return {
    page_id: 'tt_6711731671916708866',
    event_type: 'messaging',
    data: {
      conversation: { id: CONV, type: 'INBOX' },
      message: {
        id: 'tt_7452304119832249857',
        conversation_id: CONV,
        page_id: 'tt_6711731671916708866',
        message: 'alo abc',
        original_message: 'alo abc',
        type: 'INBOX',
        inserted_at: '2024-12-25T11:06:07.000000',
        from: { id: PSID, name: 'Jineo', page_customer_id: 'ddc7b38d' },
        is_removed: false,
      },
      ...overrides,
    },
    ...envelope,
  };
}

describe('mapPancakeWebhookEvent', () => {
  describe('payload válido', () => {
    it('traduce el evento messaging al contrato interno', () => {
      const result = mapPancakeWebhookEvent(validEnvelope(), phoneIndex());

      expect(result.eventType).toBe('messaging');
      expect(result.pageId).toBe('tt_6711731671916708866');
      expect(result.skipped).toEqual([]);
      expect(result.messages).toEqual([
        {
          providerMessageId: 'tt_7452304119832249857',
          from: PHONE,
          text: 'alo abc',
          timestamp: '2024-12-25T11:06:07.000000',
          providerConversationId: CONV,
        },
      ]);
    });

    it('prefiere original_message sobre message (el segundo puede traer HTML)', () => {
      const envelope = validEnvelope();
      envelope.data!.message = {
        ...envelope.data!.message!,
        message: '<div></div>',
        original_message: 'texto real',
      };

      const [mapped] = mapPancakeWebhookEvent(envelope, phoneIndex()).messages;
      expect(mapped.text).toBe('texto real');
    });

    it('usa el reloj inyectado si el evento no trae inserted_at', () => {
      const envelope = validEnvelope();
      delete envelope.data!.message!.inserted_at;

      const [mapped] = mapPancakeWebhookEvent(envelope, {
        ...phoneIndex(),
        now: new Date('2026-10-26T00:00:00.000Z'),
      }).messages;

      expect(mapped.timestamp).toBe('2026-10-26T00:00:00.000Z');
    });

    it('no inventa estados de entrega que la especificación no documenta', () => {
      const result = mapPancakeWebhookEvent(validEnvelope(), phoneIndex());

      expect(result.messages[0]).not.toHaveProperty('status');
      expect(result.messages[0]).not.toHaveProperty('deliveredAt');
      expect(Object.keys(result)).not.toContain('statuses');
    });
  });

  describe('payload desconocido', () => {
    it.each(['conversation', 'subscription', 'post', 'connect_status'])(
      'descarta el evento %s sin producir mensajes',
      (eventType) => {
        const result = mapPancakeWebhookEvent(
          validEnvelope({}, { event_type: eventType }),
          phoneIndex(),
        );

        expect(result.eventType).toBe(eventType);
        expect(result.messages).toEqual([]);
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0].reason).toBe('UNKNOWN_EVENT');
      },
    );

    it('descarta un cuerpo que no es un sobre reconocible', () => {
      const result = mapPancakeWebhookEvent(null, phoneIndex());

      expect(result.eventType).toBeNull();
      expect(result.pageId).toBeNull();
      expect(result.messages).toEqual([]);
      expect(result.skipped[0].reason).toBe('UNKNOWN_EVENT');
    });

    it('descarta messaging sin data.message', () => {
      const result = mapPancakeWebhookEvent(
        { page_id: 'p', event_type: 'messaging', data: {} },
        phoneIndex(),
      );

      expect(result.messages).toEqual([]);
      expect(result.skipped[0].reason).toBe('UNKNOWN_EVENT');
    });
  });

  describe('payload incompleto', () => {
    it('omite el mensaje sin id (no hay clave de idempotencia)', () => {
      const envelope = validEnvelope();
      // `id` es obligatorio en el tipo, así que se simula la ausencia en runtime.
      (envelope.data!.message as { id?: string }).id = undefined;

      const result = mapPancakeWebhookEvent(envelope, phoneIndex());
      expect(result.messages).toEqual([]);
      expect(result.skipped[0]).toMatchObject({
        reason: 'NO_PROVIDER_ID',
        providerMessageId: null,
      });
    });

    it('omite el mensaje sin emisor', () => {
      const envelope = validEnvelope();
      delete envelope.data!.message!.from;

      const result = mapPancakeWebhookEvent(envelope, phoneIndex());
      expect(result.messages).toEqual([]);
      expect(result.skipped[0]).toMatchObject({
        reason: 'NO_SENDER',
        providerMessageId: 'tt_7452304119832249857',
      });
    });

    it('omite el mensaje si el PSID no tiene teléfono único', () => {
      const result = mapPancakeWebhookEvent(validEnvelope(), phoneIndex([]));

      expect(result.messages).toEqual([]);
      expect(result.skipped[0].reason).toBe('NO_PHONE');
    });
  });

  describe('motivos de omisión del contrato', () => {
    it('omite los comentarios de publicación (type COMMENT)', () => {
      const envelope = validEnvelope();
      envelope.data!.message!.type = 'COMMENT';

      expect(
        mapPancakeWebhookEvent(envelope, phoneIndex()).skipped[0].reason,
      ).toBe('COMMENT');
    });

    it('omite un evento cuyo conversation.type es COMMENT', () => {
      const envelope = validEnvelope();
      envelope.data!.conversation!.type = 'COMMENT';

      expect(
        mapPancakeWebhookEvent(envelope, phoneIndex()).skipped[0].reason,
      ).toBe('COMMENT');
    });

    it('omite los mensajes eliminados (is_removed)', () => {
      const envelope = validEnvelope();
      envelope.data!.message!.is_removed = true;

      expect(
        mapPancakeWebhookEvent(envelope, phoneIndex()).skipped[0].reason,
      ).toBe('REMOVED');
    });

    it('omite los mensajes escritos por un asesor (uid / admin_id)', () => {
      const withUid = validEnvelope();
      withUid.data!.message!.from = { id: PSID, uid: 'staff-uuid' };
      expect(
        mapPancakeWebhookEvent(withUid, phoneIndex()).skipped[0].reason,
      ).toBe('STAFF');

      const withAdmin = validEnvelope();
      withAdmin.data!.message!.from = { id: PSID, admin_id: 'admin-id' };
      expect(
        mapPancakeWebhookEvent(withAdmin, phoneIndex()).skipped[0].reason,
      ).toBe('STAFF');
    });
  });

  describe('duplicados entre entregas', () => {
    it('dos entregas del mismo evento producen la misma clave de idempotencia', () => {
      const first = mapPancakeWebhookEvent(validEnvelope(), phoneIndex());
      const second = mapPancakeWebhookEvent(validEnvelope(), phoneIndex());

      expect(first.messages).toHaveLength(1);
      expect(second.messages).toHaveLength(1);
      expect(second.messages[0].providerMessageId).toBe(
        first.messages[0].providerMessageId,
      );
    });

    it('el adaptador no deduplica por sí mismo: no mantiene estado entre llamadas', () => {
      const first = mapPancakeWebhookEvent(validEnvelope(), phoneIndex());
      const second = mapPancakeWebhookEvent(validEnvelope(), phoneIndex());

      expect(second.messages[0]).toEqual(first.messages[0]);
    });
  });
});
