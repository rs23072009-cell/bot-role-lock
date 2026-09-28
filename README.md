# Bot Role Lock

Bot Discord qui empêche l’attribution de rôles verrouillés. Toute nouvelle attribution est retirée automatiquement et peut être envoyée dans un salon de logs.

## Commandes slash

```text
/rolelock setup [salon]
/rolelock verrouiller rôle
/rolelock deverrouiller rôle
/rolelock statut rôle
/rolelock limite rôle maximum
/rolelock liste
/rolelock logs [salon]
```

`setup` crée, ou utilise, un salon de gestion avec un panneau détaillé : détenteurs actuels, limites configurées et fonctionnement du verrouillage. Le menu **Déverrouiller un rôle** affiche uniquement les rôles actuellement verrouillés.

Le verrouillage conserve les détenteurs actuels et bloque toute nouvelle attribution, qu’elle soit faite par un membre, un modérateur, un autre bot ou un système automatique. Une limite autorise le rôle jusqu’au nombre choisi, puis retire les attributions supplémentaires.

## Permissions Discord

Le bot a besoin de **Gérer les rôles**, **Voir les logs d’audit**, **Voir les salons**, **Envoyer des messages** et **Intégrer des liens**. Son rôle doit se trouver au-dessus des rôles protégés.

Active l’intent **Server Members Intent** dans le portail Discord. Le bot fonctionne uniquement avec des commandes slash et n’utilise pas Message Content.

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

