const fs = require('fs');
const path = require('path');

// Simple Vue loader for esbuild
// This is a very basic implementation that extracts the script part of Vue files
// For a full-featured Vue loader, you would use esbuild plugins
const vuePlugin = {
  name: 'vue',
  setup(build) {
    build.onLoad({ filter: /\.vue$/ }, async (args) => {
      const source = await fs.promises.readFile(args.path, 'utf8');
      
      // Extract script content from Vue file
      // This is a very basic implementation
      const scriptMatch = /<script>([\s\S]*?)<\/script>/i.exec(source);
      if (!scriptMatch || !scriptMatch[1]) {
        return { 
          contents: 'export default {}',
          loader: 'js'
        };
      }
      
      // Return the script content
      return {
        contents: scriptMatch[1],
        loader: 'js'
      };
    });
  }
};

// Main build function
async function build() {
  try {
    const esbuild = require('esbuild');
    
    await esbuild.build({
      entryPoints: ['posawesome/public/js/posapp/posapp.js'],
      bundle: true,
      outfile: 'posawesome/public/js/posawesome.bundle.js',
      format: 'iife',
      plugins: [vuePlugin],
      external: ['idb', 'uuid', 'vue', 'vuetify'],
      loader: {
        '.js': 'jsx',
      },
      define: {
        'process.env.NODE_ENV': '"production"'
      }
    });
    
    console.log('Build completed successfully');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

// Run the build
build(); 