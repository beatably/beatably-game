/**
 * Visitor metadata helpers
 * - Country: resolved from an edge/CDN country header when present, otherwise
 *   from the IANA timezone the browser reports. No IP address is ever stored.
 * - Device / browser / OS: coarse buckets parsed from the user-agent string.
 * Deliberately dependency-free: this runs on every pageview beacon.
 */

// IANA timezone -> ISO 3166-1 alpha-2. Covers the populated zones; anything
// unlisted falls back to the region prefix map below, then 'unknown'.
const TZ_COUNTRY = {
  'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK',
  'Europe/Helsinki': 'FI', 'Atlantic/Reykjavik': 'IS', 'Europe/London': 'GB',
  'Europe/Dublin': 'IE', 'Europe/Lisbon': 'PT', 'Atlantic/Azores': 'PT',
  'Atlantic/Madeira': 'PT', 'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES',
  'Europe/Paris': 'FR', 'Europe/Brussels': 'BE', 'Europe/Amsterdam': 'NL',
  'Europe/Luxembourg': 'LU', 'Europe/Berlin': 'DE', 'Europe/Busingen': 'DE',
  'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Rome': 'IT',
  'Europe/Malta': 'MT', 'Europe/Vatican': 'VA', 'Europe/San_Marino': 'SM',
  'Europe/Monaco': 'MC', 'Europe/Andorra': 'AD', 'Europe/Gibraltar': 'GI',
  'Europe/Prague': 'CZ', 'Europe/Bratislava': 'SK', 'Europe/Warsaw': 'PL',
  'Europe/Budapest': 'HU', 'Europe/Ljubljana': 'SI', 'Europe/Zagreb': 'HR',
  'Europe/Sarajevo': 'BA', 'Europe/Belgrade': 'RS', 'Europe/Podgorica': 'ME',
  'Europe/Skopje': 'MK', 'Europe/Tirane': 'AL', 'Europe/Athens': 'GR',
  'Europe/Bucharest': 'RO', 'Europe/Sofia': 'BG', 'Europe/Chisinau': 'MD',
  'Europe/Kyiv': 'UA', 'Europe/Kiev': 'UA', 'Europe/Uzhgorod': 'UA',
  'Europe/Zaporozhye': 'UA', 'Europe/Simferopol': 'UA', 'Europe/Minsk': 'BY',
  'Europe/Vilnius': 'LT', 'Europe/Riga': 'LV', 'Europe/Tallinn': 'EE',
  'Europe/Moscow': 'RU', 'Europe/Kaliningrad': 'RU', 'Europe/Samara': 'RU',
  'Europe/Volgograd': 'RU', 'Europe/Saratov': 'RU', 'Europe/Astrakhan': 'RU',
  'Europe/Ulyanovsk': 'RU', 'Europe/Kirov': 'RU', 'Asia/Yekaterinburg': 'RU',
  'Asia/Omsk': 'RU', 'Asia/Novosibirsk': 'RU', 'Asia/Krasnoyarsk': 'RU',
  'Asia/Irkutsk': 'RU', 'Asia/Yakutsk': 'RU', 'Asia/Vladivostok': 'RU',
  'Asia/Magadan': 'RU', 'Asia/Kamchatka': 'RU', 'Asia/Sakhalin': 'RU',
  'Europe/Istanbul': 'TR', 'Asia/Istanbul': 'TR', 'Asia/Nicosia': 'CY',
  'Asia/Famagusta': 'CY', 'Europe/Nicosia': 'CY',

  'America/New_York': 'US', 'America/Detroit': 'US', 'America/Chicago': 'US',
  'America/Denver': 'US', 'America/Phoenix': 'US', 'America/Los_Angeles': 'US',
  'America/Anchorage': 'US', 'America/Juneau': 'US', 'America/Sitka': 'US',
  'America/Nome': 'US', 'America/Adak': 'US', 'Pacific/Honolulu': 'US',
  'America/Boise': 'US', 'America/Indiana/Indianapolis': 'US',
  'America/Kentucky/Louisville': 'US', 'America/Menominee': 'US',
  'America/North_Dakota/Center': 'US', 'America/Puerto_Rico': 'PR',
  'Pacific/Guam': 'GU', 'Pacific/Pago_Pago': 'AS',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/St_Johns': 'CA',
  'America/Regina': 'CA', 'America/Whitehorse': 'CA', 'America/Moncton': 'CA',
  'America/Mexico_City': 'MX', 'America/Tijuana': 'MX', 'America/Monterrey': 'MX',
  'America/Cancun': 'MX', 'America/Chihuahua': 'MX', 'America/Hermosillo': 'MX',
  'America/Guatemala': 'GT', 'America/Belize': 'BZ', 'America/El_Salvador': 'SV',
  'America/Tegucigalpa': 'HN', 'America/Managua': 'NI', 'America/Costa_Rica': 'CR',
  'America/Panama': 'PA', 'America/Havana': 'CU', 'America/Jamaica': 'JM',
  'America/Port-au-Prince': 'HT', 'America/Santo_Domingo': 'DO',
  'America/Nassau': 'BS', 'America/Barbados': 'BB', 'America/Port_of_Spain': 'TT',
  'America/Bogota': 'CO', 'America/Caracas': 'VE', 'America/Lima': 'PE',
  'America/Guayaquil': 'EC', 'America/La_Paz': 'BO', 'America/Asuncion': 'PY',
  'America/Montevideo': 'UY', 'America/Santiago': 'CL',
  'America/Argentina/Buenos_Aires': 'AR', 'America/Argentina/Cordoba': 'AR',
  'America/Argentina/Mendoza': 'AR', 'America/Argentina/Salta': 'AR',
  'America/Sao_Paulo': 'BR', 'America/Bahia': 'BR', 'America/Fortaleza': 'BR',
  'America/Recife': 'BR', 'America/Manaus': 'BR', 'America/Belem': 'BR',
  'America/Cuiaba': 'BR', 'America/Porto_Velho': 'BR', 'America/Noronha': 'BR',
  'America/Paramaribo': 'SR', 'America/Guyana': 'GY', 'America/Cayenne': 'GF',

  'Africa/Cairo': 'EG', 'Africa/Casablanca': 'MA', 'Africa/Algiers': 'DZ',
  'Africa/Tunis': 'TN', 'Africa/Tripoli': 'LY', 'Africa/Khartoum': 'SD',
  'Africa/Lagos': 'NG', 'Africa/Accra': 'GH', 'Africa/Abidjan': 'CI',
  'Africa/Dakar': 'SN', 'Africa/Bamako': 'ML', 'Africa/Ouagadougou': 'BF',
  'Africa/Nairobi': 'KE', 'Africa/Kampala': 'UG', 'Africa/Dar_es_Salaam': 'TZ',
  'Africa/Addis_Ababa': 'ET', 'Africa/Kigali': 'RW', 'Africa/Luanda': 'AO',
  'Africa/Kinshasa': 'CD', 'Africa/Lubumbashi': 'CD', 'Africa/Douala': 'CM',
  'Africa/Libreville': 'GA', 'Africa/Harare': 'ZW', 'Africa/Lusaka': 'ZM',
  'Africa/Maputo': 'MZ', 'Africa/Gaborone': 'BW', 'Africa/Windhoek': 'NA',
  'Africa/Johannesburg': 'ZA', 'Indian/Mauritius': 'MU',

  'Asia/Jerusalem': 'IL', 'Asia/Tel_Aviv': 'IL', 'Asia/Gaza': 'PS',
  'Asia/Hebron': 'PS', 'Asia/Beirut': 'LB', 'Asia/Damascus': 'SY',
  'Asia/Amman': 'JO', 'Asia/Baghdad': 'IQ', 'Asia/Riyadh': 'SA',
  'Asia/Kuwait': 'KW', 'Asia/Bahrain': 'BH', 'Asia/Qatar': 'QA',
  'Asia/Dubai': 'AE', 'Asia/Muscat': 'OM', 'Asia/Aden': 'YE',
  'Asia/Tehran': 'IR', 'Asia/Kabul': 'AF', 'Asia/Karachi': 'PK',
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Colombo': 'LK',
  'Asia/Kathmandu': 'NP', 'Asia/Dhaka': 'BD', 'Asia/Thimphu': 'BT',
  'Asia/Yangon': 'MM', 'Asia/Bangkok': 'TH', 'Asia/Vientiane': 'LA',
  'Asia/Phnom_Penh': 'KH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Saigon': 'VN',
  'Asia/Kuala_Lumpur': 'MY', 'Asia/Kuching': 'MY', 'Asia/Singapore': 'SG',
  'Asia/Jakarta': 'ID', 'Asia/Makassar': 'ID', 'Asia/Jayapura': 'ID',
  'Asia/Manila': 'PH', 'Asia/Brunei': 'BN', 'Asia/Dili': 'TL',
  'Asia/Hong_Kong': 'HK', 'Asia/Macau': 'MO', 'Asia/Taipei': 'TW',
  'Asia/Shanghai': 'CN', 'Asia/Urumqi': 'CN', 'Asia/Chongqing': 'CN',
  'Asia/Seoul': 'KR', 'Asia/Pyongyang': 'KP', 'Asia/Tokyo': 'JP',
  'Asia/Ulaanbaatar': 'MN', 'Asia/Almaty': 'KZ', 'Asia/Aqtobe': 'KZ',
  'Asia/Tashkent': 'UZ', 'Asia/Ashgabat': 'TM', 'Asia/Dushanbe': 'TJ',
  'Asia/Bishkek': 'KG', 'Asia/Baku': 'AZ', 'Asia/Tbilisi': 'GE',
  'Asia/Yerevan': 'AM',

  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Australia/Hobart': 'AU',
  'Australia/Darwin': 'AU', 'Australia/Canberra': 'AU',
  'Pacific/Auckland': 'NZ', 'Pacific/Chatham': 'NZ', 'Pacific/Fiji': 'FJ',
  'Pacific/Port_Moresby': 'PG', 'Pacific/Noumea': 'NC', 'Pacific/Tahiti': 'PF',
  'Pacific/Apia': 'WS', 'Pacific/Tongatapu': 'TO', 'Pacific/Guadalcanal': 'SB',
};

// Fallback when the exact zone is unknown but the region is recognisable.
const TZ_PREFIX_COUNTRY = {
  'America/Argentina': 'AR', 'America/Indiana': 'US', 'America/Kentucky': 'US',
  'America/North_Dakota': 'US',
};

const ISO_COUNTRY_RE = /^[A-Za-z]{2}$/;

/**
 * Resolve a two-letter country code for a visit.
 * Priority: CDN/edge header (exact, when the host adds one) -> browser timezone.
 */
function resolveCountry({ headers = {}, timezone } = {}) {
  const headerCandidates = [
    headers['cf-ipcountry'],
    headers['x-vercel-ip-country'],
    headers['x-country-code'],
    headers['fastly-client-country'],
  ];
  for (const candidate of headerCandidates) {
    if (candidate && ISO_COUNTRY_RE.test(candidate) && candidate.toUpperCase() !== 'XX') {
      return candidate.toUpperCase();
    }
  }

  if (typeof timezone === 'string' && timezone) {
    const tz = timezone.slice(0, 64);
    if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
    const prefix = tz.split('/').slice(0, 2).join('/');
    if (TZ_PREFIX_COUNTRY[prefix]) return TZ_PREFIX_COUNTRY[prefix];
  }

  return 'unknown';
}

/** Coarse device bucket: 'mobile' | 'tablet' | 'desktop' | 'unknown'. */
function detectDevice(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return 'unknown';
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone|IEMobile|BlackBerry/i.test(ua)) return 'mobile';
  return 'desktop';
}

/** Coarse browser family. Order matters: Chrome-derived UAs mention Safari. */
function detectBrowser(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return 'unknown';
  if (/Beatably|CFNetwork|Darwin/i.test(ua) && !/Mozilla/i.test(ua)) return 'ios-app';
  if (/Edg\//i.test(ua)) return 'edge';
  if (/OPR\/|Opera/i.test(ua)) return 'opera';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Firefox\/|FxiOS/i.test(ua)) return 'firefox';
  if (/CriOS|Chrome\//i.test(ua)) return 'chrome';
  if (/Safari\//i.test(ua)) return 'safari';
  return 'other';
}

/** Coarse OS family. */
function detectOS(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return 'unknown';
  if (/iPhone|iPad|iPod|iOS/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macos';
  if (/Windows/i.test(ua)) return 'windows';
  if (/CrOS/i.test(ua)) return 'chromeos';
  if (/Linux/i.test(ua)) return 'linux';
  return 'other';
}

module.exports = { resolveCountry, detectDevice, detectBrowser, detectOS };
