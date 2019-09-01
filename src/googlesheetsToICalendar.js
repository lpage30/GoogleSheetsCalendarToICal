const xmlToJsonParser = require('fast-xml-parser')
const { writeFile } = require('fs')
const fetch = require('node-fetch')
const ical = require('ical-generator')
const { promisify } = require('util')
const uuid = require('uuid/v5')
const googleCalendar = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSoARRvPLLH7NaG_AD7Jf2fHv-d9XXhW7nZLsSHiRWiQCqC7a-mg8nx15mxxjsyFqF_lJ5YGPaJo-WF/pubhtml'
const writeFileAsync = promisify(writeFile)

const TD_BLACKLIST_VALUES = ['S', 'M', 'T', 'W', 'Th', 'F',
    'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER', 'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY']
const MONTHS = ['Jan', 'January', 'Feb', 'February', 'March', 'April', 'May', 'June', 'July', 
    'Aug', 'August', 'Sept', 'September', 'Oct', 'October', 'Nov', 'November', 'Dec', 'December']
const MONTH_NUM = [0, 0, 1, 1, 2, 3, 4, 5, 6, 
    7, 7, 8, 8, 9, 9, 10, 10, 11, 11]
const ACADEMIC_YEAR_OFFSET = [1, 1, 1, 1, 1, 1, 1, 1, 1, 
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
const TIME_REGEX = new RegExp('[0-9]{1,2}:[0-9][0-9][ ]*(am|pm|a.m.|p.m.){0,1}', 'ig')
const TIMEAM_REGEX = new RegExp('[0-9][ ]*(am|a.m.)', 'ig')
const DEFAULT_DURATION_HRS = 1
const sortDateAsc = (l, r) => l < r ? -1 : l > r ? 1 : 0
const namespace = Array.from('googlesheets_cal').map(s => s.charCodeAt(0));

const isEvent = (data) => typeof(data) === 'string' &&
    data.length > 0 &&
    !TD_BLACKLIST_VALUES.includes(data) &&
    MONTHS.some(value => data.startsWith(value));

const isNumber = char => !/\s/.test(char) && !isNaN(char)
const indexOfNonNumber = (line) => {
    let offset = 0
    while (true && offset < line.length) {
     const char = line.substr(offset, 1)
     if (isNumber(char)) {
        offset += 1
     } else {
         break
     }
    }
    return offset
}
const indexOfNumber= (line) => {
    let offset = 0
    while (true && offset < line.length) {
        const char = line.substr(offset, 1)
        if (!isNumber(char)) {
            offset += 1
        } else {
            break
        }
    }
    return offset
}
const getDate = (month, day, fallYear) => new Date(fallYear + ACADEMIC_YEAR_OFFSET[MONTHS.indexOf(month)], MONTH_NUM[MONTHS.indexOf(month)], day)
const getLowestIndex = (indexes) => {
    const nonNeg = indexes.filter(index => index >= 0)
    if (nonNeg.length === 0) return -1
    return nonNeg.sort(sortDateAsc)[0]
}
const extractDates = (line, fallYear) => {
    const result = []
    let mos
    let day
    while (true) {
        const m = MONTHS.filter(mos => line.startsWith(mos))[0]
        if (m) {
            line = line.substr(m.length + 1).trim()
            mos = m
        }
        let numberOffset = indexOfNumber(line)
        if (numberOffset >= line.length) {
            break;
        }
        line = line.substr(numberOffset).trim()
        let nonNumberOffset = indexOfNonNumber(line)
        day = parseInt(line.substr(0, nonNumberOffset), 10)
        line = line.substr(nonNumberOffset).trim()
        result.push(getDate(mos, day, fallYear))
        const delimIndex = getLowestIndex([line.indexOf('-'), line.indexOf('&'), line.indexOf('/')])
        if (delimIndex >= 0 && delimIndex <= 4) {
            line = line.substr(delimIndex + 1).trim()
        } else {
            break;
        }
    }
    return result
}

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
    return result
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
    const dates = datesubjecttime.length > 1 ? getDates(datesubjecttime[0], fallYear) : extractDates(datesubjecttime[0], fallYear)
    const times = datesubjecttime.length > 2 ? datesubjecttime[2].match(TIME_REGEX) : datesubjecttime.length > 1 ? datesubjecttime[1].match(TIME_REGEX) : datesubjecttime[0].match(TIME_REGEX)
    const hrMinutes = (times || []).map(time => toHoursMinute(time))
    return dates.map(date => {
         const newDates = []
         try {
            const newDate = new Date(date.toISOString())
            hrMinutes.forEach(hrminute => {
                newDate.setHours(hrminute.hrs, hrminute.minute)
                newDates.push(new Date(newDate.toISOString()))
            })
            if (hrMinutes.length === 0) {
                newDates.push(new Date(newDate.toISOString()))
            }
        } catch (error) {
            console.error('DateTime issue', datesubjecttime, hrMinutes, dates, date, error)
        }
        return newDates
    }).map(items => items[0])
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
    const subject = datesubjecttime.length > 1 ? datesubjecttime[1] : datesubjecttime[0]
    const start = dateTimes[0]
    let end = null

    if (dateTimes.length > 0) {
        if (dateTimes.length > 1) {
            end = dateTimes[1]
        } else {
            end = new Date(dateTimes[0].toISOString())
            end.setHours(end.getHours() + DEFAULT_DURATION_HRS)
        }
    }
    const uniqueName = `${start.getMonth()}${start.getFullYear()}${subject}`;
    const uid = uuid(uniqueName, namespace);
    const result = {
        start,
        end,
        uid,
        allDay: dateTimes.some(datetime => datetime.getHours() === 0),
        summary: subject,
    }
    return result
}

function extractTableRows(headElement) {
    const result = []
    if (headElement.table) {
        headElement.table.tbody.tr.forEach(tr => {
            const data = tr.td.map(td => {
                if (typeof(td) === 'object' && td.div) {
                    return td.div
                }
                return td
            }).filter(isEvent)
            result.push(...data)
        })
    } else {
        if (headElement.div && headElement.div instanceof Array) {
            headElement.div.forEach(elem => {
                result.push(...extractTableRows(elem))
            })
        } 
    }
    return result
}
async function fetchGoogleSheetCalendarData(uri) {
    const response = await fetch(uri)
    const xmlText = await response.text()
    const jsonObject = xmlToJsonParser.parse(xmlText)
    return extractTableRows(jsonObject.html.head.meta.body)
}

async function googleSheetsUrlsToICalEvents(calendarSheetsUrls, fallYear) {
    const result = []
    for(let i = 0; i < calendarSheetsUrls.length; i++) {
        const data = await fetchGoogleSheetCalendarData(calendarSheetsUrls[i])
        const events = data
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
    const icalEvents = await googleSheetsUrlsToICalEvents(calendarSheetsUrls, fallYear)
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
