import type { EngineInterface, Register } from 'claude-code'

import { editorWindowId, fileBasename, interceptTargets, phpstormUrl } from './links'

// `setsid -f` detaches xdg-open, and the redirects close the pipes
// `$.process.run` reads, so the call returns before PhpStorm exits.
const LAUNCH = 'setsid -f xdg-open "$1" </dev/null >/dev/null 2>&1'

// KWin's window runner lists windows by title and activates one by id. KWin
// grants that activation; it refuses PhpStorm's own request on Wayland.
const RUNNER = ['gdbus', 'call', '--session', '-d', 'org.kde.KWin', '-o', '/WindowsRunner']

// How often and how long to wait for PhpStorm's title to name the file.
const POLL_MS = 250
const WAIT_MS = 15_000

// Waits until a PhpStorm window title names `basename`, then activates it.
async function raise($: EngineInterface, basename: string): Promise<void> {
  const until = (await $.clock.now()) + WAIT_MS
  while ((await $.clock.now()) < until) {
    const found = await $.process.run([...RUNNER, '-m', 'org.kde.krunner1.Match', basename])
    const id = found.exitCode === 0 ? editorWindowId(found.stdout, basename) : undefined
    if (id !== undefined) {
      await $.process.run([...RUNNER, '-m', 'org.kde.krunner1.Run', id, ''])
      return
    }
    await $.clock.sleep(POLL_MS)
  }
}

async function open($: EngineInterface, href: string): Promise<void> {
  const url = phpstormUrl(href)
  if (url === undefined) return
  const launched = await $.process.run(['sh', '-c', LAUNCH, 'sh', url], { timeoutMs: 10_000 })
  if (launched.exitCode !== 0) {
    $.ui.toast(`phpstorm-links: exit ${launched.exitCode} ${launched.stderr}`)
    return
  }
  const basename = fileBasename(url)
  if (basename !== undefined) await raise($, basename)
}

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    const targets = interceptTargets(e.props.text)
    if (targets.length === 0) return next(e)

    const { Markdown } = $.ui.resolve(e)

    return (
      <Markdown
        key="phpstorm-links"
        text={e.props.text}
        pressableLinks={targets}
        onLinkPress={link => {
          open($, link.href).catch((error: unknown) => $.ui.toast(`phpstorm-links: ${String(error)}`))
        }}
      />
    )
  })
}
