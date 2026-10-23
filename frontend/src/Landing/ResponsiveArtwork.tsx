import hero640 from './assets/vaultessa-hero-640.webp';
import hero960 from './assets/vaultessa-hero-960.webp';
import hero1536 from './assets/vaultessa-hero-1536.webp';
import features640 from './assets/features-640.webp';
import features960 from './assets/features-960.webp';
import features1536 from './assets/features-1536.webp';
import security640 from './assets/security-640.webp';
import security960 from './assets/security-960.webp';
import security1536 from './assets/security-1536.webp';
import how640 from './assets/how-it-works-640.webp';
import how960 from './assets/how-it-works-960.webp';
import how1536 from './assets/how-it-works-1536.webp';

const images = { hero:[hero640,hero960,hero1536],features:[features640,features960,features1536],security:[security640,security960,security1536],'how-it-works':[how640,how960,how1536] };
export function ResponsiveArtwork({name,alt}:{name:keyof typeof images;alt:string}) {
  const [small,medium,large] = images[name];
  return <img src={medium} srcSet={`${small} 640w, ${medium} 960w, ${large} 1536w`} sizes="(max-width: 760px) 100vw, (max-width: 1400px) 58vw, 760px" alt={alt} width={1536} height={1024} fetchPriority="high" decoding="async"/>;
}
