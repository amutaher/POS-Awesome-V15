const path = require('path');
const webpack = require('webpack');

module.exports = {
    mode: 'production',
    entry: {
        'posawesome': './posawesome/public/js/posapp/Home.vue',
        'posawesome-vue': './posawesome/public/js/posawesome-vue.js'
    },
    output: {
        path: path.resolve(__dirname, 'posawesome/public/dist'),
        filename: '[name].min.js',
        publicPath: '/assets/'
    },
    module: {
        rules: [
            {
                test: /\.vue$/,
                loader: 'vue-loader'
            },
            {
                test: /\.js$/,
                loader: 'babel-loader',
                exclude: /node_modules/
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            }
        ]
    },
    resolve: {
        extensions: ['.js', '.vue'],
        alias: {
            'vue$': 'vue/dist/vue.esm.js'
        }
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env': {
                NODE_ENV: '"production"'
            }
        })
    ]
}; 