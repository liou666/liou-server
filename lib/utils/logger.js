const colors = require('colors');

const warn = (info) => {
    console.log(`[warn] ${info}`.yellow)
}

const error = (info) => {
    console.log(`[error] ${info}`.red)
}

const info = (info) => {
    console.log(`[info] ${info}`.cyan)
}

const success = (info) => {
    console.log(`[success] ${info}`.green)
}


const base = (info) => {
    console.log(info)
}

module.exports = {
    warn,
    error,
    info,
    success,
    base
}