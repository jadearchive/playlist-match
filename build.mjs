import {build} from 'esbuild';
await build({entryPoints:['client/main.tsx'],bundle:true,outfile:'public/assets/app.js',minify:true,jsx:'automatic',target:['es2020'],define:{'process.env.NODE_ENV':'"production"'},legalComments:'linked'});
