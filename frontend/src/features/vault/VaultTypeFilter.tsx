import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SECRET_TYPES, type SecretType } from '@/api/vault/types';
import { TEMPLATES } from './secretTemplates';

export type VaultCategory = 'ALL' | SecretType;
const primary: Array<{value:VaultCategory;label:string}> = [
  {value:'ALL',label:'All items'}, {value:'LOGIN',label:'Logins'},
  {value:'SECURE_NOTE',label:'Secure notes'}, {value:'CARD',label:'Cards'}, {value:'IDENTITY',label:'Identities'},
];
export function VaultTypeFilter({value,onChange,typesPresent}:{value:VaultCategory;onChange:(value:VaultCategory)=>void;typesPresent:SecretType[]}) {
  const options = [...primary, ...typesPresent.filter((type) => !primary.some((option) => option.value === type)).map((type) => ({value:type,label:TEMPLATES[type].label}))];
  return <div className="shrink-0 overflow-x-auto pb-1">
    <ToggleGroup type="single" value={value} onValueChange={(next) => {
      if (next === 'ALL' || SECRET_TYPES.includes(next as SecretType)) onChange(next as VaultCategory);
    }} aria-label="Filter vault by item type" className="gap-1 p-1">
      {options.map((option) => <ToggleGroupItem key={option.value} value={option.value}>{option.label}</ToggleGroupItem>)}
    </ToggleGroup>
  </div>;
}
