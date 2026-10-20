"use client";

import { EmpresaSection } from "@/components/configuraciones/empresa-section";
import { HorariosSection } from "@/components/configuraciones/horarios-section";
import { ParametrosSection } from "@/components/configuraciones/parametros-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Configuración de la organización (specs/024-configuraciones-v1): Empresa,
 * Horarios y Parámetros. Cada sección guarda por separado, así un fallo de
 * validación en una no impide guardar las otras.
 */
export function ConfiguracionesPage() {
  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-6 p-6 lg:p-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Ajustes que aplican a tu organización.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos</CardTitle>
        </CardHeader>
        <CardContent>
          <EmpresaSection />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Envíos</CardTitle>
        </CardHeader>
        <CardContent>
          <HorariosSection />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reglas de negocio</CardTitle>
        </CardHeader>
        <CardContent>
          <ParametrosSection />
        </CardContent>
      </Card>
    </div>
  );
}
