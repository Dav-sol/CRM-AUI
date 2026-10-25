import { buildPhoneIndex, mapPancakeInbound } from './pancake.inbound';
import type { PancakeMessage, PancakePageCustomer } from './pancake.types';

/**
 * PAN-02 · contrato de entrada con payloads MOCKEADOS.
 *
 * Ningún caso abre red ni envía nada: se verifican autenticación de la fuente
 * de teléfonos, deduplicación, descarte de asesores, estados de borrado y
 * preferencia de texto original sobre el renderizado, todo sobre el esquema
 * publicado en `specs/API-Pancake/document.md`.
 */

const CUSTOMER_PSID = '1234567890123456';

const customerMessage = (
  overrides: Partial<PancakeMessage> = {},
): PancakeMessage => ({
  id: 'wamid.mock.1',
  conversation_id: CUSTOMER_PSID,
  type: 'INBOX',
  original_message: 'Hola, quiero información',
  message: '<div>Hola, quiero información</div>',
  from: { id: CUSTOMER_PSID, name: 'Cliente' },
  inserted_at: '2026-10-22T10:00:00.000Z',
  seen: false,
  is_removed: false,
  ...overrides,
});

const phoneByPsid = new Map<string, string>([[CUSTOMER_PSID, '51999888777']]);

describe('PAN-02 · Pancake → contrato interno de entrada', () => {
  describe('mapPancakeInbound', () => {
    it('mapea un mensaje del cliente resolviendo el PSID a teléfono', () => {
      const result = mapPancakeInbound([customerMessage()], { phoneByPsid });

      expect(result.messages).toEqual([
        {
          providerMessageId: 'wamid.mock.1',
          from: '51999888777',
          text: 'Hola, quiero información',
          timestamp: '2026-10-22T10:00:00.000Z',
          providerConversationId: CUSTOMER_PSID,
        },
      ]);
      expect(result.skipped).toEqual([]);
      expect(result.duplicates).toEqual([]);
    });

    it('prefiere original_message al contenido renderizado con HTML', () => {
      const result = mapPancakeInbound(
        [customerMessage({ original_message: 'texto crudo' })],
        { phoneByPsid },
      );

      expect(result.messages[0].text).toBe('texto crudo');
    });

    it('acepta mensaje sin texto (solo imagen), como MetaWhatsAppProvider', () => {
      const result = mapPancakeInbound(
        [
          customerMessage({
            original_message: undefined,
            message: '<div></div>',
          }),
        ],
        { phoneByPsid },
      );

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].text).toBe('<div></div>');
    });

    it('descarta los mensajes escritos por un asesor (admin_id)', () => {
      const result = mapPancakeInbound(
        [
          customerMessage({
            id: 'staff.1',
            from: {
              id: CUSTOMER_PSID,
              admin_id: 'admin-uuid-1',
              admin_name: 'Asesor',
            },
          }),
        ],
        { phoneByPsid },
      );

      expect(result.messages).toHaveLength(0);
      expect(result.skipped).toEqual([
        {
          providerMessageId: 'staff.1',
          conversationId: CUSTOMER_PSID,
          reason: 'STAFF',
        },
      ]);
    });

    it('descarta los mensajes escritos por un asesor (uid de Pancake)', () => {
      const result = mapPancakeInbound(
        [customerMessage({ id: 'staff.2', from: { id: 'x', uid: 'u-1' } })],
        { phoneByPsid },
      );

      expect(result.skipped[0]?.reason).toBe('STAFF');
    });

    it('descarta mensajes eliminados en el inbox', () => {
      const result = mapPancakeInbound(
        [customerMessage({ id: 'removed.1', is_removed: true })],
        { phoneByPsid },
      );

      expect(result.messages).toHaveLength(0);
      expect(result.skipped[0]?.reason).toBe('REMOVED');
    });

    it('descarta el mensaje sin emisor y sin PSID', () => {
      const result = mapPancakeInbound([customerMessage({ from: {} })], {
        phoneByPsid,
      });

      expect(result.skipped[0]?.reason).toBe('NO_SENDER');
    });

    it('no ingiere nada cuando el PSID no tiene teléfono: no se adivina', () => {
      const result = mapPancakeInbound([customerMessage()], {
        phoneByPsid: new Map(),
      });

      expect(result.messages).toHaveLength(0);
      expect(result.skipped[0]?.reason).toBe('NO_PHONE');
    });

    it('colapsa los IDs repetidos dentro del propio lote', () => {
      const result = mapPancakeInbound(
        [
          customerMessage(),
          customerMessage(),
          customerMessage({ id: 'wamid.mock.2' }),
        ],
        { phoneByPsid },
      );

      expect(result.messages).toHaveLength(2);
      expect(result.duplicates).toEqual(['wamid.mock.1']);
    });

    it('usa la conversación de opciones cuando el mensaje no la trae', () => {
      const result = mapPancakeInbound(
        [customerMessage({ conversation_id: undefined })],
        { phoneByPsid, conversationId: 'conv-desde-opciones' },
      );

      expect(result.messages[0].providerConversationId).toBe(
        'conv-desde-opciones',
      );
    });

    it('cae a la hora actual solo si la API no envía inserted_at', () => {
      const before = Date.now();
      const result = mapPancakeInbound(
        [customerMessage({ inserted_at: undefined })],
        { phoneByPsid },
      );

      const at = Date.parse(result.messages[0].timestamp);
      expect(at).toBeGreaterThanOrEqual(before - 1000);
      expect(at).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('tolera entrada ausente o vacía sin lanzar', () => {
      expect(mapPancakeInbound(undefined, { phoneByPsid })).toEqual({
        messages: [],
        skipped: [],
        duplicates: [],
      });
      expect(mapPancakeInbound([], { phoneByPsid })).toEqual({
        messages: [],
        skipped: [],
        duplicates: [],
      });
    });

    it('no acepta un mensaje sin id (sin clave de idempotencia)', () => {
      const result = mapPancakeInbound([customerMessage({ id: '' })], {
        phoneByPsid,
      });

      expect(result.messages).toHaveLength(0);
      expect(result.skipped[0]?.reason).toBe('NO_PROVIDER_ID');
    });
  });

  describe('buildPhoneIndex (psid → teléfono)', () => {
    const customer = (
      overrides: Partial<PancakePageCustomer> = {},
    ): PancakePageCustomer => ({
      psid: CUSTOMER_PSID,
      phone_numbers: ['51999888777'],
      ...overrides,
    });

    it('indexa el único teléfono de un cliente', () => {
      const index = buildPhoneIndex([customer()]);

      expect(index.phoneByPsid.get(CUSTOMER_PSID)).toBe('51999888777');
      expect(index.ambiguous).toEqual([]);
      expect(index.withoutPhone).toEqual([]);
    });

    it('NO elige entre varios teléfonos: lo declara ambiguo', () => {
      const index = buildPhoneIndex([
        customer({ phone_numbers: ['51999888777', '51911111111'] }),
      ]);

      expect(index.phoneByPsid.has(CUSTOMER_PSID)).toBe(false);
      expect(index.ambiguous).toEqual([{ psid: CUSTOMER_PSID, phoneCount: 2 }]);
    });

    it('registra a los clientes sin teléfono', () => {
      const index = buildPhoneIndex([customer({ phone_numbers: [] })]);

      expect(index.phoneByPsid.has(CUSTOMER_PSID)).toBe(false);
      expect(index.withoutPhone).toEqual([CUSTOMER_PSID]);
    });

    it('ignora entradas sin psid y entradas sin teléfono utilizable', () => {
      const index = buildPhoneIndex([
        { name: 'sin psid' },
        { psid: 'psid.2', phone_numbers: [null as unknown as string] },
        { psid: 'psid.3', phone_numbers: ['', 'ok'] },
      ]);

      expect(index.phoneByPsid.size).toBe(1);
      expect(index.phoneByPsid.get('psid.3')).toBe('ok');
      expect(index.withoutPhone).toEqual(['psid.2']);
    });

    it('tolera respuesta ausente', () => {
      expect(buildPhoneIndex(undefined)).toEqual({
        phoneByPsid: new Map(),
        withoutPhone: [],
        ambiguous: [],
      });
    });
  });

  describe('flujo combinado', () => {
    it('construye el índice y mapea solo los mensajes del cliente', () => {
      const customers: PancakePageCustomer[] = [
        { psid: CUSTOMER_PSID, phone_numbers: ['51999888777'] },
        { psid: 'psid.asessor', phone_numbers: ['51900000000'] },
        { psid: 'psid.varios', phone_numbers: ['1', '2'] },
      ];
      const index = buildPhoneIndex(customers);

      const result = mapPancakeInbound(
        [
          customerMessage(),
          customerMessage({
            id: 'staff.9',
            from: { id: 'psid.asessor', admin_id: 'admin-9' },
          }),
          customerMessage({ id: 'ambiguo.1', from: { id: 'psid.varios' } }),
          customerMessage(),
        ],
        { phoneByPsid: index.phoneByPsid },
      );

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].providerMessageId).toBe('wamid.mock.1');
      expect(result.duplicates).toEqual(['wamid.mock.1']);
      expect(result.skipped.map((s) => s.reason)).toEqual([
        'STAFF',
        'NO_PHONE',
      ]);
      expect(index.ambiguous).toEqual([{ psid: 'psid.varios', phoneCount: 2 }]);
    });
  });
});
