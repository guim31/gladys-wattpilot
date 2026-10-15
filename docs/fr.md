# Fronius Wattpilot

Suivez et pilotez votre borne de recharge **Fronius Wattpilot** (Wattpilot
Home et Go, 11 et 22 kW ; Wattpilot Flex en test) depuis Gladys, **sur votre
réseau local** : Gladys dialogue avec le WebSocket de la borne, comme le fait
l'appli Fronius Solar.wattpilot à la maison. Pas de cloud, pas de compte
Fronius.

> **Développée sans le matériel : vos retours sont les bienvenus.** Cette
> intégration a été écrite d'après le protocole tel que documenté et implémenté
> par d'autres projets libres (la bibliothèque `wattpilot` de joscha82,
> l'intégration Home Assistant de mk-maddin), et testée contre une fausse borne,
> sans Wattpilot sous la main. Si quelque chose semble faux, ouvrez une issue sur
> le dépôt GitHub avec les logs de l'intégration.

Cette intégration n'est pas affiliée à Fronius International GmbH.

## Prérequis

- Une Fronius Wattpilot (Home ou Go, 11 ou 22 kW) connectée à votre Wi-Fi.
  La Wattpilot Flex est prise en charge en théorie (son contrôle du mot de
  passe diffère) mais n'a pas été testée.
- Le **mot de passe de la borne** : celui choisi dans l'appli Solar.wattpilot
  à l'installation de la borne (l'appli le demande pour s'y connecter).
- Une **adresse IP fixe** pour la borne, réglée dans votre box (réservation
  DHCP) : l'intégration la joint par son adresse.
- Gladys et la borne sur le même réseau (port 80 de la borne joignable depuis
  Gladys).
- Gladys 5.2.0 ou plus récent.

## Configuration

1. Installez l'intégration depuis **Intégrations → Installer depuis GitHub**
   (ou le store), puis ouvrez son onglet **Configuration**.
2. **Adresse IP de la borne** : par exemple `192.0.2.10`.
3. **Mot de passe de la borne** : le mot de passe de l'appli Solar.wattpilot.
   Il reste dans Gladys (champ secret) et ne part que vers la borne, sous forme
   d'empreinte.
4. **Intervalle de rafraîchissement** : fréquence d'envoi des mesures
   (puissance, courant, énergie) à Gladys, 15 secondes par défaut.
5. **Langue des noms de fonctionnalités** : noms donnés aux fonctionnalités des
   nouveaux appareils et langue des textes d'erreur (français par défaut).
6. Enregistrez : la borne apparaît dans l'onglet **Découverte**. Ajoutez-la.
7. Le bouton **Tester la connexion** dit si la borne est connectée (nom,
   numéro de série, micrologiciel) ou pourquoi elle ne l'est pas.

## Rafraîchissement et usage du réseau

L'intégration garde **une connexion WebSocket** ouverte vers la borne, qui
pousse ses changements d'elle-même : rien n'est interrogé en boucle. La borne
envoie ses mesures plusieurs fois par seconde pendant une charge ;
l'intégration les transmet à Gladys à l'intervalle choisi, et **tout de suite**
quand change ce sur quoi vous agissez (état de la voiture, mode, courant,
forçage, erreur). Seules les valeurs qui ont changé sont envoyées, plus toutes
les valeurs toutes les 6 heures pour qu'une valeur stable n'affiche jamais
« Pas de valeur récente ». Gladys interroge aussi l'appareil en secours ;
l'intégration saute alors un envoi qu'elle vient de faire.

Quand la connexion tombe, l'intégration se reconnecte après 5 s, 10 s, 30 s,
puis toutes les minutes. Un mot de passe refusé n'est retenté que toutes les
10 minutes. Une borne silencieuse depuis une minute reçoit un ping, et la
connexion est rouverte si elle ne répond pas.

## L'appareil borne

| Fonctionnalité        | Ce qu'elle montre                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Connecteur            | Disponible (pas de voiture), Occupé (voiture branchée), Indisponible (hors ligne), En défaut (erreur)              |
| État de la charge     | En charge, Véhicule connecté (en attente), Suspendue (véhicule) : charge terminée, Suspendue (borne) : non permise |
| Voiture branchée      | 1 quand une voiture est branchée                                                                                   |
| Puissance de charge   | Puissance totale, W                                                                                                |
| Puissance L1, L2, L3  | Puissance par phase, W                                                                                             |
| Courant L1, L2, L3    | Courant par phase, A                                                                                               |
| Énergie de la session | Énergie depuis le branchement de la voiture, kWh                                                                   |
| Énergie totale        | Le compteur de la borne, kWh : le suivi d'énergie de Gladys en calcule la consommation et son coût                 |
| Courant de charge     | **Commande** : le courant proposé à la voiture, de 6 A à 16 A (11 kW) ou 32 A (22 kW)                              |
| Mode de charge        | **Commande** : Standard, Éco, Next Trip — les modes de l'appli Solar.wattpilot                                     |
| Forçage de la charge  | **Commande** : Selon le mode, Charge forcée, Arrêt forcé                                                           |
| Température           | Le capteur le plus chaud de la borne, °C                                                                           |
| Erreur                | L'erreur de la Wattpilot en clair (« Aucune » quand tout va bien)                                                  |
| En ligne              | 1 tant que la borne est connectée                                                                                  |

Le **mode de charge** ne fait que passer d'un mode à l'autre ; leurs réglages
(surplus solaire et prix limite d'Éco, heure de départ et énergie de Next
Trip) restent dans l'appli Solar.wattpilot et Solar.web : cette intégration ne
duplique pas la recharge solaire. **Charge forcée** charge quoi que décide le
mode ; **Selon le mode** lui rend la main.

Le courant ne peut pas dépasser la limite réglée dans l'appli (« courant
maximal ») : l'intégration le refuse avec un message plutôt que de l'envoyer.

## Widget

Ajoutez le widget **Fronius Wattpilot** à un tableau de bord et choisissez la
borne. Il montre la puissance en direct, l'énergie de la session et le courant
de charge, l'état (Prête, En charge, En attente, Charge terminée, Erreur), le
mode, un forçage en cours et l'erreur éventuelle. Quatre boutons : **Charger**
(charge forcée), **Arrêter** (arrêt forcé), **Auto** (selon le mode) et
**Réglages…**, qui ouvre un formulaire pour régler le courant et le mode de
charge. Le forçage en cours porte une icône de coche.

## Déclencheur de scène

**Charge Wattpilot terminée** : la voiture a cessé de consommer après une
charge (elle est pleine, ou a atteint la limite réglée dans la voiture ou
l'appli). Choisissez éventuellement la borne. Les actions suivantes peuvent
utiliser `energy_kwh` (énergie de la session) et `charger` (son nom). Il se
déclenche une fois par charge, jamais au démarrage.

« Voiture branchée » n'a pas besoin de déclencheur : utilisez la
fonctionnalité **Voiture branchée** (passe à 1) dans un déclencheur « valeur
d'un appareil ».

## Actions de scène

- **Régler le mode de charge Wattpilot** : Standard, Éco ou Next Trip.
- **Forcer ou arrêter la charge Wattpilot** : charge forcée, arrêt forcé, ou
  selon le mode.

Le courant de charge n'a pas besoin d'action dédiée : c'est une
fonctionnalité, réglée par l'action habituelle « contrôler un appareil ».

## Exemples de scènes

- **Solaire le jour, plein la nuit** : à 8 h, « Régler le mode de charge
  Wattpilot » sur Éco ; à 22 h, sur Standard.
- **Prévenez-moi quand la voiture est pleine** : déclencheur « Charge
  Wattpilot terminée », puis envoi d'un message « Charge terminée :
  {{triggerEvent.data.energy_kwh}} kWh ».
- **Protéger le disjoncteur** : quand la puissance de la maison dépasse un
  seuil, régler le courant de charge sur 6 A ; quand elle redescend, revenir à
  16 A.
- **Départ tôt demain** : depuis un bouton du tableau de bord, « Forcer ou
  arrêter la charge Wattpilot » sur Charge forcée ; à 7 h, retour à Selon le
  mode.

## Dépannage

- **« Pas de réponse »** : vérifiez l'adresse, que la borne est sur le Wi-Fi,
  et que Gladys et la borne sont sur le même réseau.
- **« Un appareil répond, mais pas un Wattpilot »** : l'adresse est celle d'un
  autre appareil (la box, l'onduleur…).
- **« La borne refuse le mot de passe »** : saisissez à nouveau le mot de passe
  de l'appli Solar.wattpilot (attention aux majuscules). Après un refus,
  l'intégration ne réessaie que toutes les 10 minutes : appuyez sur **Tester la
  connexion** pour réessayer tout de suite.
- **« Connectée, mais la borne n'a pas envoyé son état à temps »** :
  redémarrez la borne, puis appuyez sur **Tester la connexion**.
- **Une commande échoue avec « la borne a refusé la demande »** : la valeur
  sort de ce que la borne accepte en ce moment.
- Les logs de l'intégration disent le reste : réglez `LOG_LEVEL=debug` pour le
  détail de chaque changement.

## Limites

- Une seule borne par Gladys. Deux Wattpilot : ouvrez une issue.
- Les noms des fonctionnalités et le courant maximal sont figés à l'ajout de
  l'appareil (règle de Gladys) : pour changer de langue, supprimez l'appareil
  puis ajoutez-le à nouveau.
- Pas d'accès aux badges RFID, aux plannings, aux réglages solaires et de prix,
  à la commutation de phases ni au verrou du câble : ils restent dans l'appli
  Solar.wattpilot. Le verrou du câble n'est volontairement pas exposé.
- Gladys garde une connexion ouverte vers la borne, à côté de l'appli et
  peut-être d'une autre box domotique. Le nombre de connexions simultanées
  acceptées n'est pas documenté : si l'appli ne peut plus se connecter quand
  Gladys l'est, signalez-le dans une issue.
- Wattpilot Flex : son contrôle du mot de passe (bcrypt) suit l'intégration
  Home Assistant, sans test sur une vraie Flex.
- Testée uniquement contre une fausse borne et des descriptions publiées du
  protocole (voir la note en tête).
