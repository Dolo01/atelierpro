-- Forfaits de départ (modifiables par le superadmin dans l'application)
insert into public.plans (name, price_monthly, max_staff, max_clients, perks, sort_order) values
 ('Solo', 3000, 1, 80, array['1 utilisateur','Jusqu''à 80 clients','Devis et suivi WhatsApp'], 1),
 ('Atelier', 7500, 3, null, array['Jusqu''à 3 employés','Clients illimités','Rapports financiers'], 2),
 ('Maison de couture', 15000, 10, null, array['Jusqu''à 10 employés','Clients illimités','Rapports détaillés'], 3);
