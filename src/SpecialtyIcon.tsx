import {
  Accessibility,Activity,Apple,AudioLines,Binary,Bone,Brain,CircleDot,Droplets,FlaskConical,Flower2,Footprints,
  GalleryVerticalEnd,Hand,HeartHandshake,Leaf,Music,Orbit,PersonStanding,Sparkles,Sprout,Waves,Wind,Zap,
} from 'lucide-react';

const icons={
  accessibility:Accessibility,activity:Activity,apple:Apple,'audio-lines':AudioLines,binary:Binary,bone:Bone,brain:Brain,
  'circle-dot':CircleDot,droplets:Droplets,'flask-conical':FlaskConical,'flower-2':Flower2,footprints:Footprints,
  'gallery-vertical-end':GalleryVerticalEnd,hand:Hand,'heart-handshake':HeartHandshake,leaf:Leaf,music:Music,orbit:Orbit,
  'person-standing':PersonStanding,sparkles:Sparkles,sprout:Sprout,waves:Waves,wind:Wind,zap:Zap,
} as const;

export default function SpecialtyIcon({iconKey,size=15}:{iconKey:string;size?:number}) {
  const Icon=icons[iconKey as keyof typeof icons]||Sparkles;
  return <Icon size={size} aria-hidden="true"/>;
}
