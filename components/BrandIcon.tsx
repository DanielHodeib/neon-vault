import { ImageResponse } from 'next/og';

import { VaultMark } from './VaultMark';

/** The vault mark as a PNG (favicon, home-screen and install icons share it). */
export function brandIcon(size: number) {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 50% 45%, #13261d 0%, #0b0d12 70%)', borderRadius: size * 0.22 }}>
        <VaultMark size={size} color="#3ddc97" bg={null} />
      </div>
    ),
    { width: size, height: size },
  );
}
