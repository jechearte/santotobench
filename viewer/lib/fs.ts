import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";

/**
 * Obtiene el directorio donde se almacenan los ficheros .jsonl
 * Por defecto usa ./data relativo al proyecto
 */
export function getRunsDir(): string {
  return process.env.RUNS_DIR || join(process.cwd(), "data");
}

/**
 * Lista todos los ficheros .jsonl en el directorio de runs
 */
export async function listRunFiles(): Promise<string[]> {
  const dir = getRunsDir();
  
  try {
    const files = await readdir(dir);
    return files
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .reverse(); // Más recientes primero
  } catch (error) {
    console.error("Error leyendo directorio de runs:", error);
    return [];
  }
}

/**
 * Lee el contenido de un fichero .jsonl
 */
export async function readRunFile(fileName: string): Promise<string | null> {
  const dir = getRunsDir();
  const filePath = join(dir, fileName);
  
  // Validar que el fichero está dentro del directorio permitido (seguridad)
  if (!filePath.startsWith(dir)) {
    console.error("Intento de acceso a fichero fuera del directorio permitido");
    return null;
  }
  
  try {
    const content = await readFile(filePath, "utf-8");
    return content;
  } catch (error) {
    console.error(`Error leyendo fichero ${fileName}:`, error);
    return null;
  }
}

/**
 * Obtiene metadatos de un fichero (fecha de modificación)
 */
export async function getFileStats(fileName: string): Promise<{ mtime: Date } | null> {
  const dir = getRunsDir();
  const filePath = join(dir, fileName);
  
  try {
    const stats = await stat(filePath);
    return { mtime: stats.mtime };
  } catch (error) {
    console.error(`Error obteniendo stats de ${fileName}:`, error);
    return null;
  }
}





