import { useState, useEffect } from 'react';

// Map common country names/variants → ISO 3166-1 alpha-2 codes
const NAME_TO_CODE = {
  'ghana':'gh','nigeria':'ng','kenya':'ke','tanzania':'tz','uganda':'ug',
  'rwanda':'rw',"côte d'ivoire":'ci','ivory coast':'ci','cameroon':'cm',
  'senegal':'sn','mali':'ml','burkina faso':'bf','benin':'bj','togo':'tg',
  'niger':'ne','dr congo':'cd','congo':'cg','zambia':'zm','zimbabwe':'zw',
  'mozambique':'mz','south africa':'za','ethiopia':'et','egypt':'eg',
  'morocco':'ma','algeria':'dz','tunisia':'tn','sudan':'sd','angola':'ao',
  'malawi':'mw','namibia':'na','botswana':'bw','liberia':'lr',
  'sierra leone':'sl','guinea':'gn','ghana':'gh',
  'united states':'us','usa':'us','united kingdom':'gb','uk':'gb',
  'germany':'de','france':'fr','italy':'it','spain':'es','netherlands':'nl',
  'belgium':'be','switzerland':'ch','sweden':'se','norway':'no','denmark':'dk',
  'finland':'fi','poland':'pl','ukraine':'ua','turkey':'tr',
  'india':'in','china':'cn','japan':'jp','south korea':'kr','singapore':'sg',
  'malaysia':'my','indonesia':'id','philippines':'ph','vietnam':'vn',
  'thailand':'th','pakistan':'pk','bangladesh':'bd',
  'saudi arabia':'sa','uae':'ae','united arab emirates':'ae','qatar':'qa',
  'brazil':'br','mexico':'mx','colombia':'co','argentina':'ar',
  'canada':'ca','australia':'au','new zealand':'nz',
};

function resolveCode(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Already a valid 2-letter ISO code
  if (s.length === 2) return s.toLowerCase();
  // 3-letter codes — truncate to 2
  if (s.length === 3) return s.slice(0, 2).toLowerCase();
  // Full name lookup
  const lower = s.toLowerCase();
  return NAME_TO_CODE[lower] || null;
}

export { resolveCode };

export default function CountryFlag({ countryCode, className = 'w-5 h-4' }) {
  const [code, setCode] = useState(() => resolveCode(countryCode));

  useEffect(() => {
    setCode(resolveCode(countryCode));
  }, [countryCode]);

  // Unknown country — render nothing rather than showing a wrong flag
  if (!code) return null;

  return (
    <img
      src={`https://flagcdn.com/48x36/${code}.png`}
      srcSet={`https://flagcdn.com/96x72/${code}.png 2x`}
      alt={code.toUpperCase()}
      className={`${className} object-cover rounded-sm inline-block flex-shrink-0`}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
        const span = document.createElement('span');
        span.textContent = '🌍';
        span.style.fontSize = '14px';
        e.currentTarget.parentNode.insertBefore(span, e.currentTarget);
      }}
    />
  );
}
