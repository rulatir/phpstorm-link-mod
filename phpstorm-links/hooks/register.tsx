import type { EngineInterface, Register } from 'claude-code'

import { editorWindowId, fileBasename, interceptTargets, phpstormUrl, rewritePhpstormLinks } from './links'

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
  // Raising the window needs KWin; without it PhpStorm still opens the file.
  if (basename !== undefined) await raise($, basename).catch(() => undefined)
}

// The system prompt section that tells the model which link form to write.
export const LINK_RULE = [
  '# Code links open in PhpStorm',
  'The phpstorm-links mod in this session opens code links in PhpStorm.',
  'Whenever you reference a file, or a line in a file, on this machine, write',
  'a markdown link with the target',
  '`phpstorm://open?file=<absolute path>&line=<N>`',
  '(`&line=1` when no line applies) and the link text `<basename>:<N>`, as in',
  '[Kernel.php:42](phpstorm://open?file=/srv/app/src/Kernel.php&line=42).',
  'Use this form in place of project-relative links.',
].join('\n')

export const register: Register = on => {
  // The click handling works on the desktop surface, so the rule goes only to
  // sessions drawn there.
  on('prompt.compose', async (_, e, next) => {
    const composed = await next(e)
    if (!e.surfaces.includes('desktop')) return composed
    return {
      sections: [...composed.sections, { id: 'phpstorm-links:rule', text: LINK_RULE, scope: 'session' }],
    }
  })

  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    // The terminal opens phpstorm:// links by itself; the desktop app does not.
    const text = e.surface === 'desktop' ? rewritePhpstormLinks(e.props.text) : e.props.text
    const targets = interceptTargets(text)
    if (targets.length === 0) return next(e)

    const { Markdown } = $.ui.resolve(e)

    return (
      <Markdown
        key="phpstorm-links"
        text={text}
        pressableLinks={targets}
        onLinkPress={link => {
          open($, link.href).catch((error: unknown) => $.ui.toast(`phpstorm-links: ${String(error)}`))
        }}
      />
    )
  })
}
