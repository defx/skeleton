import express from "express"
import { html, render } from "@defx/c8"

const app = express()
const port = 3000

app.use(express.static("public"))

/*

@todo: provide a wildcard route and use the path to load different "app" files

*/

app.get("/", (_, res) => {
  res.send(
    render(html`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta http-equiv="X-UA-Compatible" content="IE=edge" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
          <title>C8 Playground</title>
        </head>
        <body>
          <text-tagger></text-tagger>
          <script type="module" src="app.js"></script>
        </body>
      </html>
    `)
  )
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
