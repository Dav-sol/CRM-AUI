import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isCivilDate, isPurchaseDateInput } from './civil-date';

/**
 * Decorador de `class-validator` que exige una fecha civil canónica
 * `YYYY-MM-DD` que exista realmente (D-1, PIT §4 RF-02).
 *
 * Sustituye a `@IsDateString()`, que acepta marcas de tiempo con zona o sin
 * zona. Con las columnas del ERP migradas a `DATE`, aceptar esas marcas
 * truncaría la hora en silencio y produciría un día cuyo origen no puede
 * reconstruirse.
 */
@ValidatorConstraint({ name: 'isCivilDate', async: false })
export class IsCivilDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isCivilDate(value);
  }

  defaultMessage(): string {
    return 'debe ser una fecha civil YYYY-MM-DD válida (ej. 2026-01-31)';
  }
}

export function IsCivilDate(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      constraints: [],
      validator: IsCivilDateConstraint,
    });
  };
}

/**
 * Decorador para la frontera de compras: acepta la fecha civil canónica
 * `YYYY-MM-DD` y también un instante inequívoco con zona declarada, que se
 * convierte a su día civil en `America/Bogota`. Rechaza cualquier instante sin
 * zona, cuya interpretación dependería del reloj del proceso.
 */
@ValidatorConstraint({ name: 'isPurchaseDateInput', async: false })
export class IsPurchaseDateInputConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isPurchaseDateInput(value);
  }

  defaultMessage(): string {
    return (
      'debe ser una fecha civil YYYY-MM-DD (ej. 2026-01-31) o un instante ' +
      'ISO 8601 con zona (ej. 2026-01-31T18:00:00Z)'
    );
  }
}

export function IsPurchaseDateInput(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      constraints: [],
      validator: IsPurchaseDateInputConstraint,
    });
  };
}
