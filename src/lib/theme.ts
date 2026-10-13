// Colores de la marca para lo que no pasa por Tailwind (graficos, SVG).
// No hay ningun valor aca: se leen de las variables de src/index.css, que es
// donde esta definido el color.
export type ThemeColor = 'brand' | 'brand-hover' | 'brand-edge' | 'brand-light'

export function themeColor(name: ThemeColor): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()
  return `rgb(${value.split(/\s+/).join(', ')})`
}
