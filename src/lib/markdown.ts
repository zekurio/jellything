import { marked, type Token, type Tokens } from "marked"
import { createElement, type ReactNode } from "react"

export function sanitizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString()
    }
  } catch {
    return "#"
  }

  return "#"
}

function renderInlineTokens(
  tokens: Token[] | undefined,
  keyPrefix: string,
): ReactNode[] {
  if (!tokens) {
    return []
  }

  return tokens.flatMap((token, index) => {
    const key = `${keyPrefix}-${token.type}-${index}`

    switch (token.type) {
      case "text":
        if (token.tokens) {
          return renderInlineTokens(token.tokens, key)
        }
        return token.text
      case "strong":
        return createElement(
          "strong",
          { key },
          renderInlineTokens(token.tokens, key),
        )
      case "em":
        return createElement(
          "em",
          { key },
          renderInlineTokens(token.tokens, key),
        )
      case "codespan":
        return createElement(
          "code",
          {
            className: "rounded bg-muted px-1 py-0.5 font-mono text-xs",
            key,
          },
          token.text,
        )
      case "br":
        return createElement("br", { key })
      case "link":
        return createElement(
          "a",
          {
            href: sanitizeUrl(token.href),
            target: "_blank",
            rel: "noreferrer",
            className: "text-primary underline underline-offset-4",
            key,
          },
          renderInlineTokens(token.tokens, key),
        )
      default:
        return token.raw
    }
  })
}

function renderBlockTokens(
  tokens: Token[] | undefined,
  keyPrefix: string,
): ReactNode[] {
  if (!tokens) {
    return []
  }

  return tokens.flatMap((token, index) => {
    const key = `${keyPrefix}-${token.type}-${index}`

    switch (token.type) {
      case "space":
        return []
      case "paragraph":
        return createElement(
          "p",
          {
            className: "text-sm leading-6",
            key,
          },
          renderInlineTokens(token.tokens, key),
        )
      case "heading": {
        const headingClass =
          token.depth <= 2
            ? "text-lg font-semibold"
            : token.depth === 3
              ? "text-base font-semibold"
              : "text-sm font-semibold"

        return createElement(
          `h${token.depth}`,
          {
            className: headingClass,
            key,
          },
          renderInlineTokens(token.tokens, key),
        )
      }
      case "list":
        return createElement(
          token.ordered ? "ol" : "ul",
          {
            className: token.ordered
              ? "ml-4 list-decimal space-y-1 text-sm"
              : "ml-4 list-disc space-y-1 text-sm",
            key,
          },
          token.items.map((item: Tokens.ListItem, itemIndex: number) =>
            createElement(
              "li",
              { key: `${key}-item-${itemIndex}` },
              item.tokens
                ? renderBlockTokens(item.tokens, `${key}-item-${itemIndex}`)
                : item.text,
            ),
          ),
        )
      case "code":
        return createElement(
          "pre",
          {
            className: "overflow-x-auto rounded-md bg-muted p-3 text-xs",
            key,
          },
          createElement("code", null, token.text),
        )
      case "blockquote":
        return createElement(
          "blockquote",
          {
            className:
              "border-l-2 border-border pl-4 text-sm text-muted-foreground",
            key,
          },
          renderBlockTokens(token.tokens, key),
        )
      case "html":
        return null
      case "text":
        return createElement(
          "p",
          {
            className: "text-sm leading-6",
            key,
          },
          renderInlineTokens(token.tokens ?? [token], key),
        )
      default:
        return null
    }
  })
}

export function renderMarkdown(markdown: string): ReactNode {
  const normalized = markdown.replaceAll("\r\n", "\n").trim()
  if (normalized.length === 0) {
    return null
  }

  const tokens = marked.lexer(normalized, {
    gfm: true,
  })

  return renderBlockTokens(tokens, "markdown")
}
