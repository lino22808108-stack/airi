import { isStageTamagotchi } from '@proj-airi/stage-shared'

import type { ChatClientSurface } from './turn-clock'

/** Tamagotchi/Electron is always PC. A mobile UA outside Electron is phone. */
export function resolveChatClientSurface(): ChatClientSurface {
  if (isStageTamagotchi())
    return 'pc'

  if (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent))
    return 'phone'

  return 'pc'
}
