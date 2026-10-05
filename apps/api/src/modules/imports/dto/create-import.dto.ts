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
   */
  @IsOptional()
  @IsBoolean()
  installationFromPurchaseDate?: boolean;
}
