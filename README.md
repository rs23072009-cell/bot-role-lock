# Bot Role Lock

Bot Discord qui empêche l’attribution de rôles verrouillés. Toute nouvelle attribution est retirée automatiquement et peut être envoyée dans un salon de logs.

## Commandes

```text
;rolelock setup [#salon]
;rolelock lock @rôle
;rolelock unlock @rôle
;rolelock status @rôle
;rolelock list
;rolelock logs #salon
;rolelock logs off
;rolelock help
```

`setup` crée, ou utilise, un salon de gestion avec deux menus : **Verrouiller un rôle** et **Déverrouiller un rôle**.

## Permissions Discord

Le bot a besoin de **Gérer les rôles**, **Voir les logs d’audit**, **Voir les salons**, **Envoyer des messages** et **Intégrer des liens**. Son rôle doit se trouver au-dessus des rôles protégés.

Active aussi les intents **Server Members Intent** et **Message Content Intent** dans le portail Discord.

## Installation Oracle

```bash
sudo mkdir -p /opt/bot-role-lock
sudo chown -R opc:opc /opt/bot-role-lock
git clone git@github.com:rs23072009-cell/bot-role-lock.git /opt/bot-role-lock
cd /opt/bot-role-lock
npm install --omit=dev
npm run check
sudo install -o root -g root -m 600 .env.example /etc/bot-role-lock.env
sudo nano /etc/bot-role-lock.env
sudo cp deploy/bot-role-lock.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bot-role-lock
sudo systemctl status bot-role-lock --no-pager
```

