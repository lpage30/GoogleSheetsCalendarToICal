# GoogleSheetsCalendarToICal
Calendars specified in GoogleSheets should be ICal format or have ICal option.
Spreadsheet is not useful to the tech savvy. Multiple calendars can reside in each downloaded GoogleSheet.
Each of these calendars will be in its own table.

## USAGE
obtain 1 or more URLs for Google Sheets Calendars  

```
npm run ConvertToICal -- -i <url1> <url2> ... <urln> [-y <fall-year>] [-o <icaloutputfile] [-t <ical-title>]


npm run ConvertToICal -- 

  Converts 1 or more Google Sheets Calenders (referenced by uri)  
  to a single icalendar format                                                  

Options

  -t, --title string         (optional) Title for created icalendar. (default: Google Sheets)    
  -o, --output string        (optional) Filename of ical file to create. (default: googlesheets.ical
  -y, --fallYear number (required) 4 digit year for fall of academic calendar
  -i, --input uri   (required) 1 or more URI's each to a google sheets page to download and use to create   
                             icalendar file.                                                               
  -h, --help                 Usage or help information                                                     
```
Generates a 1 ical file for each table discovered : googlesheetsical: 
example:
```
 npm run ConvertToICal -- -i 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSoARRvPLLH7NaG_AD7Jf2fHv-d9XXhW7nZLsSHiRWiQCqC7a-mg8nx15mxxjsyFqF_lJ5YGPaJo-WF/pubhtml'
```
