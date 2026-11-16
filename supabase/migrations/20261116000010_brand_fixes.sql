-- Бренд = производитель, а не система: Samyang/Sigma/Tamron/Sirui для Canon и Sony, вспышки Godox, клетка Tilta.
-- Меняется только products.brand (применено на проекте 2026-11-16).
with fix(id, brand) as (values
 ('light-godox-v860-iii-canon','Godox'),('light-godox-v860-iii-sony','Godox'),
 ('lenses-samyang-14mm-canon','Samyang'),('lenses-samyang-24mm-canon','Samyang'),('lenses-samyang-35mm-canon','Samyang'),
 ('lenses-sigma-art-18-35mm-dc-canon','Sigma'),('lenses-sigma-art-24-70mm-dg-canon','Sigma'),
 ('lenses-sigma-135mm-f-1-8-dg-hsm-art-для-sony-e','Sigma'),('lenses-sigma-16mm-f1-4-dc-dn-sony','Sigma'),('lenses-sigma-30mm-f1-4-dc-dn-sony','Sigma'),('lenses-sigma-56mm-f1-4-dc-dn-sony','Sigma'),
 ('lenses-sigma-60-600mm-f-4-5-6-3-dg-dn-os-sony-e','Sigma'),('lenses-sigma-65mm-f-2-dg-dn-contemporary-для-son','Sigma'),('lenses-sigma-70mm-f2-8-dg-macro-sony','Sigma'),
 ('lenses-sigma-art-16-28mm-f2-8-dg-dn-sony','Sigma'),('lenses-sigma-art-24-70mm-f2-8-dg-dn-sony','Sigma'),('lenses-sigma-art-28mm-f1-4-sony-e','Sigma'),
 ('lenses-sirui-50mm-f1-8-anamorphic-sony','Sirui'),('lenses-tamron-17-70mm-f2-8-rxd-sony','Tamron'),('lenses-tamron-28-75mm-f2-8-g2-vxd-sony','Tamron'),('lenses-tamron-28-75mm-f2-8-rxd-sony','Tamron'),
 ('grip-клетка-tilta-advanced-kit-blackmagic-6k-pro','Tilta'))
update public.products p set brand = fix.brand, updated_at = now() from fix where p.id = fix.id and p.brand <> fix.brand;
