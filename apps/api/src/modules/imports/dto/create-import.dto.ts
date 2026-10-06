import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ImportType } from '@prisma/client';

export class CreateImportDto {
  @IsEnum(ImportType)
  type!: ImportType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  organizationId?: string;

  /**
   * Solo PURCHASES. Cuando la fila no trae columna de instalación, usar
   * `purchaseDate` como `installationDate`.
   *
   * NO es una regla del dominio: la equivalencia solo está confirmada para los
   * datos históricos de la UAT de Baterías del Caribe, así que el opt-in es
   * explícito y vive en este job, no en la organización ni por defecto.
   *
   * El campo viaja en multipart/form-data, donde todo llega como texto. La
   * conversión vive aquí, en el borde HTTP: solo "true"/"false" exactos se
   * convierten. Cualquier otro texto ("yes", "1", "on", "TRUE ") cae en
   * `@IsBoolean()` y se rechaza con 400.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  installationFromPurchaseDate?: boolean;
}
