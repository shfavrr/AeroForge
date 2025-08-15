;; AeroForge Maintenance Log Contract
;; Clarity version: 2 (using standard syntax as of 2025)
;; Manages immutable maintenance logs for aircraft in the aerospace industry.
;; Provides secure logging with access controls, audit trails, and compliance features.
;; Features include aircraft registration, role-based access, log appending, querying, and event emission.
;; Designed to prevent forgery and ensure transparency in maintenance records.

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-AIRCRAFT-NOT-REGISTERED u101)
(define-constant ERR-AIRCRAFT-ALREADY-REGISTERED u102)
(define-constant ERR-INVALID-ROLE u103)
(define-constant ERR-INVALID-DETAILS u104)
(define-constant ERR-PAUSED u105)
(define-constant ERR-ZERO-ADDRESS u106)
(define-constant ERR-INVALID-AIRCRAFT-ID u107)
(define-constant ERR-LOG-NOT-FOUND u108)
(define-constant ERR-NO-LOGS u109)
(define-constant ERR-INDEX-OUT-OF-BOUNDS u110)

;; Roles definitions
(define-constant ROLE-OWNER u1)      ;; Can register, add/remove roles, log
(define-constant ROLE_MECHANIC u2)   ;; Can log maintenance
(define-constant ROLE_INSPECTOR u3)  ;; Can log inspections, view all

;; Maximum details length (buff)
(define-constant MAX-DETAILS-LENGTH u1024)

;; Contract state
(define-data-var contract-admin principal tx-sender)
(define-data-var paused bool false)

;; Maps
;; Aircraft owners: aircraft-id -> owner principal
(define-map aircraft-owners (buff 32) principal)

;; Aircraft log counts: aircraft-id -> uint (next index)
(define-map aircraft-log-counts (buff 32) uint)

;; Logs: {aircraft-id, index} -> {block-height: uint, performer: principal, details: (buff 1024)}
(define-map maintenance-logs {aircraft-id: (buff 32), index: uint} {block-height: uint, performer: principal, details: (buff 1024)})

;; Roles: {aircraft-id, user} -> role uint
(define-map user-roles {aircraft-id: (buff 32), user: principal} uint)

;; Private helpers

(define-private (is-contract-admin)
  (is-eq tx-sender (var-get contract-admin))
)

(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

(define-private (is-valid-aircraft-id (aircraft-id (buff 32)))
  (is-some (map-get? aircraft-owners aircraft-id))
)

(define-private (has-role (aircraft-id (buff 32)) (user principal) (required-role uint))
  (let ((role (default-to u0 (map-get? user-roles {aircraft-id: aircraft-id, user: user}))))
    (or (is-eq role required-role) (is-eq role ROLE-OWNER))  ;; Owner has all permissions
  )
)

(define-private (emit-event (event-type (string-ascii 32)) (data (tuple (aircraft-id (buff 32)) (additional any))))
  (print {event: event-type, data: data})
)

;; Admin functions

(define-public (transfer-contract-admin (new-admin principal))
  (begin
    (asserts! (is-contract-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set contract-admin new-admin)
    (ok true)
  )
)

(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-contract-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (ok pause)
  )
)

;; Aircraft management

(define-public (register-aircraft (aircraft-id (buff 32)) (initial-owner principal))
  (begin
    (ensure-not-paused)
    (asserts! (is-contract-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-none (map-get? aircraft-owners aircraft-id)) (err ERR-AIRCRAFT-ALREADY-REGISTERED))
    (asserts! (not (is-eq initial-owner 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (map-set aircraft-owners aircraft-id initial-owner)
    (map-set aircraft-log-counts aircraft-id u0)
    (map-set user-roles {aircraft-id: aircraft-id, user: initial-owner} ROLE-OWNER)
    (emit-event "aircraft-registered" {aircraft-id: aircraft-id, additional: initial-owner})
    (ok true)
  )
)

(define-public (transfer-aircraft-ownership (aircraft-id (buff 32)) (new-owner principal))
  (begin
    (ensure-not-paused)
    (asserts! (is-valid-aircraft-id aircraft-id) (err ERR-AIRCRAFT-NOT-REGISTERED))
    (asserts! (has-role aircraft-id tx-sender ROLE-OWNER) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-owner 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (map-set aircraft-owners aircraft-id new-owner)
    (map-set user-roles {aircraft-id: aircraft-id, user: new-owner} ROLE-OWNER)
    (emit-event "ownership-transferred" {aircraft-id: aircraft-id, additional: new-owner})
    (ok true)
  )
)

;; Role management

(define-public (add-role (aircraft-id (buff 32)) (user principal) (role uint))
  (begin
    (ensure-not-paused)
    (asserts! (is-valid-aircraft-id aircraft-id) (err ERR-AIRCRAFT-NOT-REGISTERED))
    (asserts! (has-role aircraft-id tx-sender ROLE-OWNER) (err ERR-NOT-AUTHORIZED))
    (asserts! (or (is-eq role ROLE_MECHANIC) (is-eq role ROLE_INSPECTOR)) (err ERR-INVALID-ROLE))
    (asserts! (not (is-eq user 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (map-set user-roles {aircraft-id: aircraft-id, user: user} role)
    (emit-event "role-added" {aircraft-id: aircraft-id, additional: {user: user, role: role}})
    (ok true)
  )
)

(define-public (remove-role (aircraft-id (buff 32)) (user principal))
  (begin
    (ensure-not-paused)
    (asserts! (is-valid-aircraft-id aircraft-id) (err ERR-AIRCRAFT-NOT-REGISTERED))
    (asserts! (has-role aircraft-id tx-sender ROLE-OWNER) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (has-role aircraft-id user ROLE-OWNER)) (err ERR-NOT-AUTHORIZED))
    (map-delete user-roles {aircraft-id: aircraft-id, user: user})
    (emit-event "role-removed" {aircraft-id: aircraft-id, additional: user})
    (ok true)
  )
)

;; Logging functions

(define-public (log-maintenance (aircraft-id (buff 32)) (details (buff 1024)))
  (begin
    (ensure-not-paused)
    (asserts! (is-valid-aircraft-id aircraft-id) (err ERR-AIRCRAFT-NOT-REGISTERED))
    (asserts! (> (len details) u0) (err ERR-INVALID-DETAILS))
    (asserts! (<= (len details) MAX-DETAILS-LENGTH) (err ERR-INVALID-DETAILS))
    (asserts! (or (has-role aircraft-id tx-sender ROLE_MECHANIC) (has-role aircraft-id tx-sender ROLE_INSPECTOR) (has-role aircraft-id tx-sender ROLE-OWNER)) (err ERR-NOT-AUTHORIZED))
    (let ((current-count (default-to u0 (map-get? aircraft-log-counts aircraft-id)))
          (log-index current-count)
          (block-height block-height))
      (map-set maintenance-logs {aircraft-id: aircraft-id, index: log-index} {block-height: block-height, performer: tx-sender, details: details})
      (map-set aircraft-log-counts aircraft-id (+ current-count u1))
      (emit-event "maintenance-logged" {aircraft-id: aircraft-id, additional: {index: log-index, block-height: block-height}})
      (ok log-index)
    )
  )
)

;; Query functions

(define-read-only (get-aircraft-owner (aircraft-id (buff 32)))
  (ok (map-get? aircraft-owners aircraft-id))
)

(define-read-only (get-log-count (aircraft-id (buff 32)))
  (ok (default-to u0 (map-get? aircraft-log-counts aircraft-id)))
)

(define-read-only (get-maintenance-log (aircraft-id (buff 32)) (index uint))
  (match (map-get? maintenance-logs {aircraft-id: aircraft-id, index: index})
    log (ok log)
    (err ERR-LOG-NOT-FOUND)
  )
)

(define-read-only (get-user-role (aircraft-id (buff 32)) (user principal))
  (ok (default-to u0 (map-get? user-roles {aircraft-id: aircraft-id, user: user})))
)

(define-read-only (get-contract-admin)
  (ok (var-get contract-admin))
)

(define-read-only (is-contract-paused)
  (ok (var-get paused))
)