import {
  classifyInbound,
  isExplicitMaintenanceConsent,
  normalize,
} from './inbound-classifier';

describe('classifyInbound (spec 025 §6, §10, §21)', () => {
  it('detecta la petición expresa de no recibir mensajes', () => {
    // Caso real de la BD: Sofía Rodríguez, 27/09 13:04.
    expect(
      classifyInbound('Por favor no me escriban más, no estoy interesada.'),
    ).toBe('OPT_OUT');
    expect(classifyInbound('No quiero más mensajes')).toBe('OPT_OUT');
    expect(classifyInbound('Por favor no me escriban más')).toBe('OPT_OUT');
  });

  it('funciona con y sin acentos', () => {
    expect(classifyInbound('La bateria esta fallando')).toBe(
      classifyInbound('La batería está fallando'),
    );
  });

  it('detecta los marcadores de atención humana que nombra el documento', () => {
    expect(classifyInbound('Quiero hablar con alguien')).toBe(
      'HUMAN_ATTENTION',
    );
    expect(classifyInbound('¿Por qué se me está descargando?')).toBe(
      'HUMAN_ATTENTION',
    );
    expect(classifyInbound('Tengo un problema con la batería')).toBe(
      'HUMAN_ATTENTION',
    );
  });

  it('detecta una reclamación de producto', () => {
    expect(
      classifyInbound('Se me dañó la batería, quiero una devolución'),
    ).toBe('COMPLAINT');
    expect(classifyInbound('Es un producto defectuoso')).toBe('COMPLAINT');
  });

  it('el opt-out gana a reclamación y a atención humana', () => {
    expect(
      classifyInbound('Tengo un problema con la batería, no me escriban más'),
    ).toBe('OPT_OUT');
  });

  it('un mensaje de cortesía NO es ninguna señal', () => {
    // Casos reales del tenant que NO deben pausar nada.
    expect(classifyInbound('Sí, todo perfecto.')).toBe('NONE');
    expect(classifyInbound('Sí, todo bien, gracias.')).toBe('NONE');
    expect(classifyInbound('Gracias, me avisas cuándo puedo pasar.')).toBe(
      'NONE',
    );
  });

  it('una pregunta comercial NO es una señal', () => {
    expect(classifyInbound('¿Cuánto cuesta la AGM?')).toBe('NONE');
    expect(classifyInbound('Es una Silverado. ¿La tienen para hoy?')).toBe(
      'NONE',
    );
  });

  it('vacío o ruido no inventa una señal', () => {
    expect(classifyInbound('')).toBe('NONE');
    expect(classifyInbound('¿¿¿')).toBe('NONE');
    expect(classifyInbound('    ')).toBe('NONE');
  });

  it('normalize quita acentos, signos y colapsa espacios', () => {
    expect(normalize('¿Por qué?  Sí,   gracias!')).toBe('por que si gracias');
  });
});

describe('isExplicitMaintenanceConsent (§4.6, PD-7)', () => {
  it('nunca infiere consentimiento del texto libre', () => {
    // La spec prohíbe expresamente convertir estos textos en consentimiento.
    for (const text of [
      'Sí',
      'sí',
      'Si',
      'gracias',
      'Gracias',
      'ok',
      'Ok',
      'dale',
      'Sí, gracias',
    ]) {
      expect(isExplicitMaintenanceConsent(text)).toBe(false);
    }
  });

  it('tampoco con un texto que lo pida literalmente', () => {
    expect(isExplicitMaintenanceConsent('quiero los recordatorios')).toBe(
      false,
    );
  });
});
