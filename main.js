const CommandLineArgs = require('command-line-args')
const CommandLineUsage = require('command-line-usage')
const { writeICalendars } = require('./src/googleSheetsToICalendar')

const DEFAULT_TITLE = 'Google Sheets'
const DEFAULT_OUTPUT= 'googlesheets.ical'

const optionDefinitions = [
    { name: 'title', alias: 't', type: String, defaultValue: DEFAULT_TITLE,
      description: `(optional) Title for created icalendar. (default: ${DEFAULT_TITLE})`},
    { name: 'output', alias: 'o', type: String, defaultValue: DEFAULT_OUTPUT,
      description: `(optional) Filename of ical file to create. (default: ${DEFAULT_OUTPUT}` },
    { name: 'fallYear', alias: 'y', type: Number, defaultValue: (new Date()).getFullYear(),
      description: `(required) 4 digit year for fall of academic calendar. (default: ${(new Date()).getFullYear()}` },
    { name: 'input', alias: 'i',  multiple: true, type: (uri) => new URL(uri),
      description: '(required) 1 or more URI\'s each to a google sheets page download and use to create icalendar file.' },
    { name: 'help', alias: 'h', type: Boolean, description: 'Usage or help information'},
]

const logUsage = (scriptName) => console.log(CommandLineUsage([
    {
        header: `npm run ${scriptName} -- `,
        content: 'Converts 1 or more Google Sheet Calenders (referenced by uri) to a single icalendar format',
    },
    {
        header: 'Options',
        optionList: optionDefinitions,
    }
]))

async function main(argv = [], scriptName='main') {
    let args
    try {
        args = CommandLineArgs(optionDefinitions, { argv })
        if(args.help) {
            logUsage(scriptName)
            return
        }
        if (!args.input || args.input.length === 0) throw new Error('No URIs specified to convert')
        if (!args.output) throw new Error('No icalendar output file specified')
        if (!args.title) throw new Error('No icalendar title specified')
    } catch(error) {
        console.error(`ERROR: ${error.message}`)
        logUsage(scriptName)
        return
    }
    const urls = args.input.map(uri => uri.href)
    console.log('Converting google sheets to icalendar',{
        title: args.title,
        icalendarFile: args.output,
        urls,
    })
    try {
        const filenames = await writeICalendars(urls, args.title, args.fallYear, args.output)
        console.log('Finished creating icalendar files!', filenames)
    } catch(error) {
        console.error('Failed to create icalendar file.', error)
    }

}
if (!module.parent) {
    main(process.argv.slice(2), 'ConvertToICal')
}
module.exports = { main }
