# HTML Exports

Why let JavaScript have all the fun? HTML documents can be modules too!


## The Syntax

### Declaring Exports

Just like ES6 modules, you can choose particular values to export from a HTML 
document. Simply place an `export` attribute on any element with that you wish
to export:

```html
<div export id="user">...</div>
```

You can also declare the default export of the document by tagging an element
with `default` (`id` is optional).

```html
<section export default id="post">...</section>
```

If you don't declare a default export, the document is exported.


### Declaring Dependencies

You can also declare dependencies on other modules from HTML.

```html
<import src="jQuery"/>
```


### Importing HTML Modules Via ES6 

Just treat a HTML module as you would any other module:

```
import { user, post } from './templates.html'
```

`user` and `post` are the _elements_ exported by `templates.html`!


## Using It

Include [`html-exports.min.js`](dist/) in your page, after loading
[es6-module-loader](https://github.com/ModuleLoader/es6-module-loader):

```html
<script src="es6-module-loader.js"></script>
<script src="html-exports.min.js"></script>
```

This gives you the default behavior where any module with a `.html` extension
is treated as a HTML module.


### SystemJS

Alternatively, you can use the SystemJS plugin by grabbing
[a build](dist/sysjs-plugin) of it, renaming your build to `html.js` and
placing that build somewhere on your load path for SystemJS to discover.

You can then load HTML modules via:

```js
// Implicit plugin name
import { user, post } from './templates.html!'
// Or explicit plugin name:
import { user, post } from './templates.html!html'
```


## Playing With It

Try out the demo:

```sh
gulp demo
```


## Hacking On It

Run this in the background for continuous testing/building:

```sh
gulp
```


## Understanding It

For a deeper understanding of how HTML Exports works, take a look at
[the annotated source](https://nevir.github.io/html-exports).
