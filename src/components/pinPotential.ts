import type { E3Device, E3Pin, E3Project, E3Wire } from '../core/e3Types';

/** Wire attached to the given device pin (if any). */
export function findPinWire(project: E3Project, deviceId: string, pinId: string): E3Wire | undefined {
  return project.wires.find(
    (w) =>
      (w.fromDeviceId === deviceId && w.fromPinId === pinId) ||
      (w.toDeviceId === deviceId && w.toPinId === pinId)
  );
}

/** Potential colour of a pin: colour of the attached wire's signal type, or null if the pin is free. */
export function getPinPotentialColor(project: E3Project, device: E3Device, pin: E3Pin): string | null {
  const wire = findPinWire(project, device.id, pin.id);
  if (!wire) return null;
  return project.visualSettings.netColors[wire.signalType] || 'var(--flux-accent)';
}
