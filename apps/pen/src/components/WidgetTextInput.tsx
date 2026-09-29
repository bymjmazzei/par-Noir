/** Visitor field. The typed value stays in the browser until Send. */

import type { PenPageLayer } from '@par-noir/pen-protocol';

export function WidgetTextInput({
  layer,
  value,
  onChange,
  onSelect
}: {
  layer: PenPageLayer;
  value: string;
  onChange: (layerId: string, value: string) => void;
  onSelect?: () => void;
}) {
  return (
    <input
      data-layer-id={layer.id}
      aria-label={layer.name || 'Text input'}
      className="pointer-events-auto h-full w-full border-0 bg-transparent px-2 text-sm outline-none"
      style={{ color: layer.textColor || '#141414', backgroundColor: layer.backgroundColor || '#ffffff' }}
      placeholder={layer.label || layer.name || ''}
      value={value}
      onChange={(event) => onChange(layer.id, event.target.value)}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.();
      }}
    />
  );
}
