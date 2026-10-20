import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { BUSINESS_DAYS, MINUTES_IN_DAY } from '../configuraciones.defaults';

/**
 * Horarios (specs/024-configuraciones-v1 §7). All fields optional: a partial
 * patch leaves the rest untouched. `businessHoursEnabled` defaults to false in
 * the database, so AU-009 only applies once an organization turns it on.
 */
export class UpdateHorariosDto {
  @IsOptional()
  @IsBoolean()
  businessHoursEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z_]+(\/[A-Za-z_+-]+)+$/, {
    message:
      'La zona horaria debe ser un identificador IANA válido (por ejemplo America/Bogota)',
  })
  timezone?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @IsEnum(BUSINESS_DAYS, {
    each: true,
    message: `Los días deben ser: ${BUSINESS_DAYS.join(', ')}`,
  })
  businessDays?: string[];

  /**
   * Minutos desde medianoche (0..1439). `null` limpia la ventana: la UI lo
   * envía explícitamente, así que el validador lo acepta y el servicio escribe
   * null en lugar de convertirlo a 0 (que además sería "inicio == fin").
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MINUTES_IN_DAY - 1)
  businessHoursStart?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MINUTES_IN_DAY - 1)
  businessHoursEnd?: number | null;
}

/**
 * Parámetros de negocio no sensibles (spec §6). Numbers stay optional so a
 * partial patch does not reset the others.
 */
export class UpdateParametrosDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  maxCommercialPer60d?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  minDaysBetweenCommercial?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  quoteExpiryDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  whatsappMessageCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  whatsappMessageCostCommercial?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  smsCostPerSegment?: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  @Matches(/^[A-Z]{3}$/, {
    message:
      'La moneda debe ser un código de 3 letras en mayúsculas (por ejemplo COP)',
  })
  smsCurrency?: string;
}
