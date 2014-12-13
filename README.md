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

TODO(nevir): Figure out document scoping of imported values, and more advanced
examples of importing via HTML. I.e.:

```html
<import src="jQuery" as="$"/>
<import src="./templates.html" values="user post"/>
```

etc.


### Importing Via ES6 

Just treat a HTML module as you would any other module:

```
import { user, post } from './templates.html'
```

`user` and `post` are the _elements_ exported by `templates.html`!


## Understanding It

For a deeper understanding of how HTML Exports works, take a look at
[the annotated source](https://nevir.github.io/html-exports).


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
