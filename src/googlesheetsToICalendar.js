const xmlToJsonParser = require('fast-xml-parser')
const { writeFile } = require('fs')
const fetch = require('node-fetch')
const ical = require('ical-generator')
const { promisify } = require('util')
const uuid = require('uuid/v5')
const googleCalendar = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSoARRvPLLH7NaG_AD7Jf2fHv-d9XXhW7nZLsSHiRWiQCqC7a-mg8nx15mxxjsyFqF_lJ5YGPaJo-WF/pubhtml'
const writeFileAsync = promisify(writeFile)

const MONTHS = ['Jan', 'Feb', 'March', 'April', 'May', 'June', 'Sept', 'Oct', 'Nov', 'Dec']
const MONTH_NUM = [0, 1, 2, 3, 4, 5, 8, 9, 10, 11]
const ACADEMIC_YEAR_OFFSET = [1, 1, 1, 1, 1, 1, 0, 0, 0, 0]
const TIME_REGEX = new RegExp('[0-9]{1,2}:[0-9][0-9][ ]*(am|pm|a.m.|p.m.){0,1}', 'ig')
const TIMEAM_REGEX = new RegExp('[0-9][ ]*(am|a.m.)', 'ig')
const DEFAULT_DURATION_HRS = 1
const sortDateAsc = (l, r) => l < r ? -1 : l > r ? 1 : 0


const getDate = (month, day, fallYear) => new Date(fallYear + ACADEMIC_YEAR_OFFSET[MONTHS.indexOf(month)], MONTH_NUM[MONTHS.indexOf(month)], day)
const getDates = (dateline, fallYear) => {
    const result = []
    const monthday = dateline.split('-')
    let month
    monthday.forEach(monthDay => {
        monthDay = monthDay.trim()
        const mos = MONTHS.filter(mos => monthDay.startsWith(mos))[0]
        if (mos) {
            monthDay = monthDay.substr(mos.length+1).trim()
            month = mos
        }
        const day = !isNaN(monthDay.substr(0, 2)) ? parseInt(monthDay.substr(0, 2), 10) : parseInt(monthDay.substr(0, 1), 10)
        result.push(getDate(month, day, fallYear))
    })
}
const toHoursMinute = time => {
    const hrsminute = time.split(':')
    let hrs = 0
    let minute = 0
    if (hrsminute.length === 2) {
        hrs = parseInt(hrsminute[0], 10)
        if(!isNaN(hrsminute[1].substr(0, 2))) {
            minute = parseInt(hrsminute[1].substr(0, 2), 10)
        } else {
            minute = parseInt(hrsminute[1].substr(0, 1), 10)
        }
        if(hrsminute[1].match(TIMEAM_REGEX) === null) {
            hrs += 12
        }
    } else {
        if(!isNaN(hrsminute[0].substr(0, 2))) {
            hrs = parseInt(hrsminute[0].substr(0, 2), 10)
        } else {
            hrs = parseInt(hrsminute[0].substr(0, 1), 10)
        }
        if(hrsminute[0].match(TIMEAM_REGEX) === null) {
            hrs += 12
        }
    }
    return { hrs, minute }
}
const getDatetimes = (datesubjecttime, fallYear) => {
    const dates = datesubjecttime.length > 1 ? getDates(datesubjecttime[0], fallYear) : [new Date(fallYear)]
    const times = datesubjecttime.length > 2 ? datesubjecttime[2].match(TIME_REGEX) : datesubjecttime.length > 1 ? datesubjecttime[1].match(TIME_REGEX) : datesubjecttime.match(TIME_REGEX)
    const hrMinutes = (times || []).map(time => toHoursMinute(time))
    return dates.map(date => {
         const dates = []
         hrMinutes.forEach(hrminute => {
             date.setHours(hrminute.hrs, hrminute.minute)
             dates.push(new Date(date.toISOString()))
         })
         if (hrMinutes.length === 0) {
             dates.push(new Date(date.toISOString()))
         }
         return dates
        })
}
/**
 * Convert the passed event extracted from HTML to
 * an ICal-generator Event object.
 * 
 * @param {string} extractedScheduleEvent 
 * @return {Object} ical object to be passed to ical-generator createEvent
 */
const getICalEvent = (extractedScheduleEvent, fallYear) => {
    const datesubjecttime = extractedScheduleEvent.split(' - ')
    const dateTimes = getDatetimes(datesubjecttime, fallYear)
    const start = dateTimes[0]
    const end = dateTimes.length === 0 ? null : 
                new Date(dateTimes.length > 1 ? dateTimes[1].getHours() : 
                dateTimes[0].setHours(dateTimes[0].getHours() + DEFAULT_DURATION_HRS))
    const uniqueName = `${start.getMonth()}${start.getFullYear()}${datesubjecttime[1]}`;
    const uid = uuid(uniqueName, namespace);
    return {
        start,
        end,
        uid,
        allDay: dateTimes.some(datetime => datetime.getHours() === 0),
        summary: datesubjecttime[1],
    }
}

const isEvent = (data) => data.length > 0 && MONTHS.some(value => data.startsWith(value));

async function googleSheetsUrlsToICalEvents(calendarSheetsUrls, fallYear) {
    const result = []
    for(let i = 0; i < calendarSheetsUrls.length; i++) {
        const response = await fetch(calendarSheetsUrls[i])
        const xmlText = await response.text()
        const jsonObject = xmlToJsonParser.parse(xmlText)
        const events = jsonObject.html.head.meta.body.div[1].div[0].div.table.tbody.tr
            .map(item => item.td.filter(isEvent))
            .filter(item => item.length === 1)
            .map(item => item[0])
            .map(item => getICalEvent(item, fallYear))
        result.push(...events)
    }
    return result
}
/**
 * Construct a single ICalendar from 1+ Urls to PDF Calendars (Northeastern format).
 * 
 * @param {URI | [URI]} calendarSheetUrls URIs to googleSheets holding calendars in a loosely extractable format.
 * @param {string} calendarTitle Name to give ICalendar
 * @param {number} fallYear
 */
async function createICalendar(calendarSheetsUrls, calendarTitle, fallYear) {
    const icalEvents = googleSheetsUrlsToICalEvents(calendarSheetsUrls, fallYear)
    icalEvents.sort((l, r) => sortDateAsc(l.start, r.start))
    const result = ical({
        name: calendarTitle
    })
    icalEvents.forEach(event => result.createEvent(event))
    return result
}
/**
 * Construct and write a single ICalendar from 1+ Urls to PDF Calendars (Northeastern format)
 * to the provided icalendarFilename
 * @param {URI | [URI]} calendarSheetsUrls URIs to googleSheets holding calendars in a loosely extractable format.
 * @param {string} calendarTitle Name to give ICalendar
 * @param {number} fallYear
 * @param {string} icalendarFilename name of icalendar file to be created
 */
async function writeICalendar(calendarSheetsUrls, calendarTitle, fallYear, icalendarFilename) {
    const icalendar = await createICalendar(calendarSheetsUrls, calendarTitle, fallYear)
    await writeFileAsync(icalendarFilename, icalendar.toString())
}
module.exports = {
    createICalendar,
    writeICalendar
}
