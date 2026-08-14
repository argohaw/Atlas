# Markdown Cheatsheet

A complete reference for all supported markdown syntax in Atlas.

---

## Headings

```
# H1
## H2
### H3
#### H4
```

---

## Text Formatting

| Style | Syntax | Output |
|-------|--------|--------|
| Bold | `**text**` | **text** |
| Italic | `*text*` | *text* |
| Strikethrough | `~~text~~` | ~~text~~ |
| Inline code | `` `code` `` | `code` |

---

## Lists

**Unordered:**
- Item one
- Item two
  - Nested item
  - Another nested

**Ordered:**
1. First step
2. Second step
3. Third step

---

## Blockquotes

> "Design is not just what it looks like and feels like. Design is how it works."
>
> — Steve Jobs

---

## Code Blocks

```javascript
function greet(name) {
  return `Hello, ${name}!`;
}

console.log(greet("Atlas"));
```

```python
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("Atlas"))
```

---

## Links & Images

```markdown
[Link text](https://example.com)
![Alt text](image.png)
```

---

## Tables

| Name       | Type     | Description              |
|------------|----------|--------------------------|
| `title`    | `string` | The document title       |
| `author`   | `string` | Author of the document   |
| `date`     | `Date`   | Publication date         |

---

## Task Lists

- [x] Create the project
- [x] Add markdown support
- [ ] Deploy to GitHub Pages
- [ ] Add dark mode
