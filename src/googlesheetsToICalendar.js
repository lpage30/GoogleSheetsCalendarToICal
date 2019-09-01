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
const DATE_REGEX = new RegExp('^[0-9]{1,2}/[0-9]{1,2}')
const DATE_RANGE_REGEX = new RegExp('^[0-9]{1,2}/[0-9]{1,2}\s*-\s*[0-9]{1,2}/[0-9]{1,2}')
const getMonthDay = (slashDate) => {
    const moday = slashDate.split('/')
    return {
        month: parseInt(moday[0], 10) -1,
        day: parseInt(moday[1], 10)
    }
}
const ENDASH_REGEX = new RegExp(String.fromCharCode(8211),'g')
const TIME_REGEX = new RegExp('[0-9]{1,2}:[0-9][0-9][ ]*(am|pm|a.m.|p.m.){0,1}', 'ig')
const TIMEAM_REGEX = new RegExp('[0-9][ ]*(am|a.m.)', 'ig')
const DEFAULT_DURATION_HRS = 1
const sortDateAsc = (l, r) => l < r ? -1 : l > r ? 1 : 0
const namespace = Array.from('googlesheets_cal').map(s => s.charCodeAt(0));

const isEvent = (data) => typeof(data) === 'string' &&
    data.length > 0 &&
    !TD_BLACKLIST_VALUES.includes(data) &&
    (MONTHS.some(value => data.startsWith(value)) ||
     DATE_REGEX.test(data));

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
const getDate = (month, day, fallYear) => {
    const monthIndex = typeof(month) === 'string' ? MONTHS.indexOf(month) : MONTH_NUM.indexOf(month)
    return new Date(fallYear + ACADEMIC_YEAR_OFFSET[monthIndex], MONTH_NUM[monthIndex], day)
}
const getLowestIndexLen = (line, delimiters) => {
    const indexLens = delimiters
        .map(delim => ({ index: line.indexOf(delim), length: delim.length }))
        .filter(indexLen => indexLen.index >= 0)
    if (indexLens.length === 0) return { index: -1, length: 0 }
    return indexLens.sort((l, r) => l.index < r.index ? -1 : l.index > r.index ? 1 : 0)[0]
}
const extractDates = (line, fallYear) => {
    const result = [{}]
    let mos
    let day
    let lastResult = 0
    while (true) {
        if (DATE_REGEX.test(line)) {
            monthdaysubstring = line.match(DATE_REGEX)[0]
            moday = getMonthDay(monthdaysubstring)
            mos = moday.month
            day = moday.day
            line = line.substr(monthdaysubstring.length).trim()
        } else {
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
        }
        if (typeof(result[lastResult].start) === 'undefined') {
            result[lastResult].start = getDate(mos, day, fallYear)
        } else {
            result[lastResult].end = getDate(mos, day, fallYear)
        }
        const delimIndexLen = getLowestIndexLen(line, ['-', '&amp;', '/'])
        if (delimIndexLen.index >= 0 && delimIndexLen.index <= 4) {
            if ('-' !== line.substr(delimIndexLen.index, delimIndexLen.length)) {
                result.push({})
                lastResult += 1
            }
            line = line.substr(delimIndexLen.index + delimIndexLen.length).trim()
        } else {
            break;
        }
    }
    return result
}

const getDates = (dateline, fallYear) => {
    const result = [{}]
    const monthday = dateline.split('-')
    let month
    let day
    monthday.forEach(monthDay => {
        monthDay = monthDay.trim()
        if (DATE_REGEX.test(monthDay)) {
            moday = getMonthDay(monthDay)
            month = moday.month
            day = moday.day
        } else {
            const mos = MONTHS.filter(mos => monthDay.startsWith(mos))[0]
            if (mos) {
                monthDay = monthDay.substr(mos.length+1).trim()
                month = mos
            }
            day = !isNaN(monthDay.substr(0, 2)) ? parseInt(monthDay.substr(0, 2), 10) : parseInt(monthDay.substr(0, 1), 10)
        }
        if (!result[0].start) {
            result[0].start = getDate(month, day, fallYear)
        } else {
            result[0].end = getDate(month, day, fallYear)
        }
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
         if (date.start) {
            const newDate = {}
            newDate.start = date.start
            if (date.end) {
                newDate.end = date.end
            }
            if (hrMinutes.length > 0) {
                if (typeof(date.end) === 'undefined') {
                    newDate.end = new Date(newDate.start.getFullYear(), newDate.start.getMonth(), newDate.start.getDate(), 
                        newDate.start.getHours(), newDate.start.getMinutes(), newDate.start.getSeconds())
                }

                hrMinutes.forEach((hrminute, index) => {
                    if (index === 0) {
                        newDate.start.setHours(hrminute.hrs, hrminute.minute)
                    }
                    newDate.end.setHours(hrminute.hrs, hrminute.minute)
                })
            }
            newDates.push(newDate)
        }
        return newDates
    }).map(items => items[0])
}
/**
 * Convert the passed event extracted from HTML to
 * an ICal-generator Event object.
 * 
 * @param {string} extractedScheduleEvent 
 * @return {Object[]} ical objects to be passed to ical-generator createEvent
 */
const getICalEvents = (extractedScheduleEvent, fallYear) => {
    let datesubjecttime = extractedScheduleEvent.split(' - ')
    if (DATE_RANGE_REGEX.test(extractedScheduleEvent)) {
        const daterange = extractedScheduleEvent.match(DATE_RANGE_REGEX)[0]
        const splitsubject = extractedScheduleEvent.substr(daterange.length).split(' - ')
        datesubjecttime = [daterange]
        splitsubject.filter(substr => substr.trim().length > 0).forEach(substr => datesubjecttime.push(substr))
    }
    const dateTimes = getDatetimes(datesubjecttime, fallYear)
    const subject = datesubjecttime.length > 1 ? datesubjecttime[1] : datesubjecttime[0]
    const result = []
    dateTimes.forEach(datetime => {
        let start = datetime.start
        const allDay = datetime.start.getHours() === 0
        let end = datetime.end
        if (allDay && end) {
            end.setHours(end.getHours() + 24)
        }
        if (typeof(end) === 'undefined' && !allDay) {
            end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours(), start.getMinutes(), start.getSeconds())
            end.setHours(end.getHours() + DEFAULT_DURATION_HRS)
        }
        start = new Date(start.toISOString())
        if (end) {
            end = new Date(end.toISOString())
        }

        const summary = dateTimes.length > 1 ? `${subject} (day ${result.length + 1} / ${dateTimes.length})`: subject
        const uniqueName = `${start.getMonth()}${start.getFullYear()}${summary}`;
        const uid = uuid(uniqueName, namespace);
        result.push({
            start,
            end,
            uid,
            allDay,
            summary,
        })
    })
    return result
}

function extractTableRows(headElement) {
    const result = []
    if (headElement instanceof Array) {
        headElement.forEach(elem => {
            result.push(...extractTableRows(elem))
        })
        return result
    }
    if (headElement.table) {
        headElement.table.tbody.tr.forEach(tr => {
            const data = tr.td.map(td => {
                if (typeof(td) === 'object' && td.div) {
                    return td.div.trim()
                } else if (typeof(td) === 'string') {
                    return td.trim()
                } else {
                    return ''
                }
            }).map(data => data.startsWith('(') ? data.substr(1, data.length - 2).trim() : data)
            .filter(isEvent).map(data => data.replace(ENDASH_REGEX, '-'))
            result.push(...data)
        })
    } else {
        if (headElement.div) {
            return extractTableRows(headElement.div)
        }
    }
    return result
}
async function fetchGoogleSheetCalendarData(uri) {
    const response = await fetch(uri)
    const xmlText = await response.text()
    const jsonObject = xmlToJsonParser.parse(xmlText)
    return [...new Set(extractTableRows(jsonObject.html.head.meta.body))]
}

async function googleSheetsUrlsToICalEvents(calendarSheetsUrls, fallYear) {
    const result = []
    for(let i = 0; i < calendarSheetsUrls.length; i++) {
        const data = await fetchGoogleSheetCalendarData(calendarSheetsUrls[i])
        data.forEach(item => result.push(...getICalEvents(item, fallYear)))
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
