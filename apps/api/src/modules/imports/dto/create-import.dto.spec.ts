import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateImportDto } from './create-import.dto';

/**
 * El campo viaja en multipart/form-data, donde todo llega como texto. El
 * ValidationPipe global corre con `transform: true`, así que el DTO recibe
 * strings ("true"/"false") y el `@Transform` los convierte antes de validar.
 * Este spec reproduce ese pipeline exacto: plainToInstance + validate.
 */
async function validateMultipart(
  body: Record<string, unknown>,
): Promise<{ dto: CreateImportDto; errors: string[] }> {
  const dto = plainToInstance(CreateImportDto, body);
  const violations = await validate(dto);
  const errors = violations.flatMap((v) => Object.values(v.constraints ?? {}));
  return { dto, errors };
}

describe('CreateImportDto.installationFromPurchaseDate (borde multipart)', () => {
  it("acepta 'true' de multipart y lo convierte a true", async () => {
    const { dto, errors } = await validateMultipart({
      type: 'PURCHASES',
      installationFromPurchaseDate: 'true',
    });

    expect(errors).toEqual([]);
    expect(dto.installationFromPurchaseDate).toBe(true);
  });

  it("acepta 'false' de multipart y lo convierte a false", async () => {
    const { dto, errors } = await validateMultipart({
      type: 'PURCHASES',
      installationFromPurchaseDate: 'false',
    });

    expect(errors).toEqual([]);
    expect(dto.installationFromPurchaseDate).toBe(false);
  });

  it('acepta booleanos reales si llegaran como JSON', async () => {
    for (const value of [true, false]) {
      const { dto, errors } = await validateMultipart({
        type: 'PURCHASES',
        installationFromPurchaseDate: value,
      });

      expect(errors).toEqual([]);
      expect(dto.installationFromPurchaseDate).toBe(value);
    }
  });

  it('sin campo: válido y queda undefined (el servicio aplica false)', async () => {
    const { dto, errors } = await validateMultipart({ type: 'PURCHASES' });

    expect(errors).toEqual([]);
    expect(dto.installationFromPurchaseDate).toBeUndefined();
  });

  it.each([['yes'], ['1'], ['on'], ['TRUE '], [''], ['0']])(
    'rechaza %p con 400 (no se acepta en silencio)',
    async (value) => {
      const { errors } = await validateMultipart({
        type: 'PURCHASES',
        installationFromPurchaseDate: value,
      });

      expect(errors).toEqual([
        'installationFromPurchaseDate must be a boolean value',
      ]);
    },
  );
});
