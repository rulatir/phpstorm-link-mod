# phpstorm-links

A Claude Code mod that opens code links in assistant messages in PhpStorm, in
the Claude desktop app.

Claude writes code links as markdown links with `phpstorm://` targets:

```
[Kernel.php:42](phpstorm://open?file=/srv/app/src/Kernel.php&line=42)
```

The desktop app does not open `phpstorm://` links, and a mod can draw a link
only for an `https:`, `http:` or `file:` target. So in the desktop app, before
it draws a message, the mod replaces each link target `phpstorm://<rest>` with
`https://phpstorm.intercept/<rest>`. The link text stays as written. The
stored message keeps `phpstorm://`. A click on a rewritten link does this:

1. The mod turns the target back into `phpstorm://<rest>` and runs `xdg-open`
   on it.
2. On KDE Plasma, it waits up to 15 seconds for a PhpStorm window whose title
   names the file, then activates that window through KWin's
   `/WindowsRunner` D-Bus object. PhpStorm cannot raise its own window on
   Wayland, and the URL handler's `wmctrl` step does not see Wayland windows.

Other links keep the app's behaviour. A message with no `phpstorm://` link is
drawn by the app. In the terminal the mod changes nothing, because terminals
open `phpstorm://` links through the system's URL handler.

The mod also adds a section to the system prompt of desktop sessions. The
section tells Claude to write file references as `phpstorm://` links.

The host `phpstorm.intercept` does not exist. It appears only in what the mod
draws; a hover tooltip or "copy link" can show it.

## Requirements

- Linux, with `xdg-open` and a handler registered for
  `x-scheme-handler/phpstorm` (for example `phpstorm-url-handler`).
- For raising the window: KDE Plasma 6 and `gdbus`. Without them, PhpStorm
  still opens the file.

## Install

At the prompt of a terminal session:

```
/plugin install phpstorm-links --marketplace rulatir/phpstorm-link-mod
```

From a shell:

```
claude plugin install phpstorm-links --marketplace rulatir/phpstorm-link-mod
```

In the desktop app: click + next to the prompt box, then Plugins, Add
marketplace with `rulatir/phpstorm-link-mod`, then Add plugin.

To run the mod from a local clone, set `CLAUDE_CODE_PLUGIN_DIRS` to the
absolute path of the `phpstorm-links` folder, in the environment or in the
`env` block of `~/.claude/settings.json`.

## Development

```
claude plugin validate phpstorm-links
claude plugin test phpstorm-links
```
