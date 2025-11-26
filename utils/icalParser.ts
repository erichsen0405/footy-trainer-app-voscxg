
import ICAL from 'ical.js';

export interface ParsedICalEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  startDate: Date;
  endDate: Date;
}

export async function fetchAndParseICalendar(url: string): Promise<ParsedICalEvent[]> {
  try {
    console.log('Fetching iCal from:', url);
    
    // Convert webcal:// to https://
    const httpUrl = url.replace(/^webcal:\/\//, 'https://');
    
    const response = await fetch(httpUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const icalData = await response.text();
    console.log('iCal data fetched, parsing...');
    
    return parseICalendarData(icalData);
  } catch (error) {
    console.error('Error fetching iCal:', error);
    throw error;
  }
}

export function parseICalendarData(icalData: string): ParsedICalEvent[] {
  try {
    const jcalData = ICAL.parse(icalData);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');
    
    console.log(`Found ${vevents.length} events in calendar`);
    
    const events: ParsedICalEvent[] = vevents.map(vevent => {
      const event = new ICAL.Event(vevent);
      
      return {
        uid: event.uid || `event-${Date.now()}-${Math.random()}`,
        summary: event.summary || 'Ingen titel',
        description: event.description || '',
        location: event.location || '',
        startDate: event.startDate ? event.startDate.toJSDate() : new Date(),
        endDate: event.endDate ? event.endDate.toJSDate() : new Date(),
      };
    });
    
    return events;
  } catch (error) {
    console.error('Error parsing iCal data:', error);
    throw error;
  }
}

export function formatTimeFromDate(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}
