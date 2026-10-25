/**
 * Setup de Jest que desplaza el reloj del proceso.
 *
 * Motivo: una prueba no puede depender del DIA en que se ejecuta. Un fixture
 * como `holidays: ['2026-10-05']` solo coincidía mientras la semana de la
 * prueba contuviera esa fecha, y el fallo lo producía el reloj, no el test.
 * Ese defecto ya occurred (la suite estuvo en rojo del 2026-10-12 al
 * 2026-10-20 sin que nadie lo notara, porque la puerta de verificación ya
 * estaba en rojo por otra causa).
 *
 * Con este setup, `scripts/check-test-determinism.sh` puede ejecutar la suite
 * con el reloj desplazado ±varios años y comprobar que el resultado NO cambia.
 * Un test dependiente de la fecha falla en cuanto el reloj se mueve.
 *
 * Uso:  SHIFT_DAYS=400 npx jest --setupFilesAfterEnv=<este fichero>
 *
 * `SHIFT_DAYS=0` (o sin la variable) no modifica nada.
 */
const shiftDays = Number(process.env.SHIFT_DAYS ?? '0');
const shiftMs = shiftDays * 24 * 60 * 60 * 1000;

if (shiftMs !== 0 && Number.isFinite(shiftMs)) {
  const RealDate = Date;
  class ShiftedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(RealDate.now() + shiftMs);
      } else {
        super(...args);
      }
    }

    static now() {
      return RealDate.now() + shiftMs;
    }
  }
  global.Date = ShiftedDate;
}
