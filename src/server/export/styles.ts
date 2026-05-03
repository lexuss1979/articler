export const ARTICLE_STYLESHEET = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 17px;
  line-height: 1.65;
  color: #1f2328;
  background: #ffffff;
  max-width: 42rem;
  margin: 0 auto;
  padding: 2rem 1.25rem;
}
h1, h2, h3, h4, h5, h6 {
  font-weight: 700;
  line-height: 1.25;
  margin: 2.2em 0 0.6em;
  color: #0f172a;
}
h1 { font-size: 2rem; margin-top: 0; }
h2 { font-size: 1.55rem; }
h3 { font-size: 1.25rem; }
h4 { font-size: 1.05rem; }
h5, h6 { font-size: 1rem; }
p { margin: 0 0 1.1em; }
img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1.5em auto;
  border-radius: 4px;
}
sub {
  display: block;
  text-align: center;
  font-size: 0.85em;
  color: #57606a;
  margin: -1em auto 1.5em;
}
a { color: #0969da; text-decoration: underline; text-underline-offset: 2px; }
a:hover { text-decoration-thickness: 2px; }
ul, ol { margin: 0 0 1.1em; padding-left: 1.5em; }
li { margin-bottom: 0.3em; }
blockquote {
  margin: 1.2em 0;
  padding: 0.4em 1em;
  border-left: 4px solid #d0d7de;
  color: #57606a;
  background: #f6f8fa;
  border-radius: 0 4px 4px 0;
}
code {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.92em;
  background: #f6f8fa;
  padding: 0.15em 0.35em;
  border-radius: 3px;
}
pre {
  background: #f6f8fa;
  padding: 1em;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0 0 1.2em;
  line-height: 1.5;
}
pre code {
  background: transparent;
  padding: 0;
  font-size: 0.92em;
}
hr {
  border: none;
  border-top: 1px solid #d0d7de;
  margin: 2em 0;
}
table {
  border-collapse: collapse;
  margin: 0 0 1.2em;
  width: 100%;
}
th, td {
  border: 1px solid #d0d7de;
  padding: 0.4em 0.75em;
  text-align: left;
  vertical-align: top;
}
th { background: #f6f8fa; font-weight: 600; }
`;
