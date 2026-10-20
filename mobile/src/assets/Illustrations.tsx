import Svg, { Path, Rect, Circle, G, Defs, LinearGradient, Stop, Ellipse } from 'react-native-svg';
export type ArtKind = 'customers' | 'quotations' | 'projects' | 'followups' | 'measurements' | 'schedules' | 'payments' | 'messages';
export const artColors = { customers: ['#E5F1FF','#0074FF'], quotations: ['#FFF1E7','#FF850B'], projects: ['#E0F6EA','#167343'], followups: ['#FFECE7','#FF493D'], measurements: ['#DDF1E6','#167343'], schedules: ['#FFEAE6','#FF493D'], payments: ['#DDF1E6','#167343'], messages: ['#E0F2FF','#066CDC'] } as const;
export function HouseLogo({ size = 36 }: { size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 64 64"><Path fill="#FF9D1B" d="M12 28L32 12 52 28V58H39V39Q32 28 25 39V58H12Z"/><Path fill="#004BAD" d="M4 25L32 2 60 25 54 32 32 14 10 32Z"/><Rect x="46" y="5" width="9" height="16" rx="3" fill="#FF9D1B"/><Path fill="#004BAD" d="M28 43Q32 37 36 43V58H28Z"/></Svg>;
}
export function IllustratedIcon({ kind, size = 46 }: { kind: ArtKind; size?: number }) {
  const [soft, ink] = artColors[kind];
  return <Svg width={size} height={size} viewBox="0 0 64 64"><Defs><LinearGradient id={`g-${kind}`} x2="1" y2="1"><Stop stopColor={soft}/><Stop offset="1" stopColor={soft}/></LinearGradient></Defs><Rect x="4" y="4" width="56" height="56" rx="19" fill={soft}/><G fill={ink}>
    {kind === 'customers' && <><Circle cx="29" cy="23" r="9"/><Path d="M12 47Q12 33 29 33Q44 33 44 47V50H12Z"/><Circle cx="47" cy="24" r="6" opacity=".55"/><Path d="M45 37H49V43H55V47H49V53H45V47H39V43H45Z"/></>}
    {kind === 'quotations' && <><Rect x="19" y="14" width="28" height="39" rx="5"/><Rect x="15" y="18" width="4" height="32" rx="2" opacity=".4"/><Path d="M26 23H40M26 30H40M26 37H37M26 44H34" stroke="white" strokeWidth="3" strokeLinecap="round"/></>}
    {kind === 'projects' && <><Path d="M11 31L32 12 53 31 48 36 32 22 16 36Z"/><Path d="M18 32L32 24 46 32V53H36V38H28V53H18Z"/><Rect x="42" y="17" width="6" height="14"/></>}
    {kind === 'followups' && <><Circle cx="31" cy="31" r="18"/><Path d="M31 19V31L38 35" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"/><Circle cx="47" cy="47" r="9" stroke="white" strokeWidth="3"/><Path d="M47 42V47M47 50V51" stroke="white" strokeWidth="2"/></>}
    {kind === 'measurements' && <G transform="rotate(-38 32 32)"><Rect x="15" y="22" width="35" height="21" rx="4"/><Path d="M22 23V32M29 23V28M36 23V32M43 23V28" stroke="white" strokeWidth="2"/><Circle cx="21" cy="37" r="2" fill="white"/></G>}
    {kind === 'schedules' && <><Rect x="15" y="18" width="35" height="34" rx="5"/><Path d="M23 13V23M42 13V23M19 28H47" stroke="white" strokeWidth="3" strokeLinecap="round"/>{[23,32,41].map(x=>[34,42].map(y=><Rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" rx="1" fill="white"/>))}</>}
    {kind === 'payments' && <Path d="M22 15H46V19H37Q41 21 42 25H46V29H42Q40 37 30 38L44 52H36L22 37V33H29Q35 33 36 29H22V25H36Q34 20 29 20H22Z"/>}
    {kind === 'messages' && <><Path d="M14 19Q14 14 20 14H46Q52 14 52 20V39Q52 45 46 45H30L20 53V45Q14 45 14 39Z"/>{[23,33,43].map(x=><Circle key={x} cx={x} cy="30" r="3" fill="white"/>)}</>}
  </G></Svg>;
}
/** Original vector artwork: villa, garden, ladder and a painter at work. */
export function PainterScene() {
  return <Svg width="100%" height="100%" viewBox="0 0 360 145" preserveAspectRatio="xMaxYMax slice">
    <Defs><LinearGradient id="sky" x2="1" y2="1"><Stop stopColor="#008BFF"/><Stop offset="1" stopColor="#81D8FF"/></LinearGradient><LinearGradient id="wall" x2="1"><Stop stopColor="#FFF8E8"/><Stop offset="1" stopColor="#EBD4AF"/></LinearGradient></Defs>
    <Rect width="360" height="145" fill="url(#sky)"/><Circle cx="325" cy="29" r="21" fill="#D7F5FF" opacity=".5"/>
    <Path d="M0 133Q55 110 112 125T230 123T360 122V145H0Z" fill="#91BE78"/>
    <Path d="M253 47L303 13 366 39V136H253Z" fill="url(#wall)"/><Path d="M250 48L302 8 370 35 367 44 303 21 253 55Z" fill="#D2965F"/><Path d="M264 42L303 19 355 39" fill="none" stroke="#FFF1D5" strokeWidth="5"/>
    <Rect x="275" y="59" width="69" height="71" fill="#FCF7ED"/>{[282,310,338].map(x=><G key={x}><Rect x={x} y="58" width="17" height="29" fill="#41768A"/><Rect x={x} y="101" width="17" height="29" fill="#5F95A0"/><Path d={`M${x+8} 58V87M${x+8} 101V130`} stroke="#D5E4DB" strokeWidth="2"/></G>)}
    <Path d="M261 91H358M263 96H358" stroke="#C9B599" strokeWidth="3"/><Path d="M266 87V98M276 87V98M286 87V98M296 87V98M306 87V98M316 87V98M326 87V98M336 87V98M346 87V98" stroke="#FCF8EC" strokeWidth="3"/>
    <Rect x="319" y="111" width="28" height="27" rx="2" fill="#BE8C5B"/><Path d="M242 145L270 58M255 145L280 58M252 111H265M249 121H262M255 101H269M259 91H272M262 81H275" stroke="#6C8FA0" strokeWidth="3"/>
    <G><Path d="M191 145L204 113 219 116 221 145" fill="#143E7C"/><Path d="M211 115L226 142" stroke="#142C61" strokeWidth="10"/><Path d="M196 106Q193 85 210 82L227 97 217 119H202Z" fill="#174C95"/><Path d="M200 91L189 77 194 71 210 85M220 89L230 67 235 69 229 98" fill="#EDB57D"/><Circle cx="213" cy="72" r="10" fill="#F2BC82"/><Path d="M203 70Q204 55 218 59L225 68 202 72Z" fill="#FFA41D"/><Path d="M207 61L219 61" stroke="#FBD265" strokeWidth="3"/><Path d="M232 68L241 48 237 46" stroke="#DCECF1" strokeWidth="3"/><Rect x="221" y="35" width="29" height="12" rx="3" fill="#FFA318" transform="rotate(20 235 41)"/><Rect x="220" y="35" width="4" height="12" rx="2" fill="#FFD179" transform="rotate(20 235 41)"/><Path d="M201 98L215 95M200 106L214 103" stroke="#99C6E8" strokeWidth="2"/></G>
    {[8,25,42,152,171,332,347].map((x,i)=><G key={x}><Rect x={x} y={112-i%2*6} width="3" height="31" fill="#839062"/><Circle cx={x+1} cy={114-i%2*6} r={11+i%3} fill={i%2?'#78A95B':'#A7C572'}/><Circle cx={x-4} cy={120-i%2*6} r="8" fill="#5B9352"/></G>)}
    <Path d="M0 144H360" stroke="#E9D0A3" strokeWidth="7"/><Ellipse cx="232" cy="140" rx="14" ry="4" fill="#7B9E7C"/><Rect x="231" y="126" width="13" height="13" rx="2" fill="#0075D9"/><Path d="M232 127Q238 117 244 127" stroke="#D7EAF3" strokeWidth="2" fill="none"/>
  </Svg>;
}
