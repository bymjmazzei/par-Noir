WHAT IS CLAIMED IS:

1. An identity recovery system comprising:
a processor; and
a non-transitory computer-readable storage medium storing instructions that, when executed by the processor, cause the processor to:
maintain a portable identity file comprising an encrypted post-quantum identity payload, a recovery envelope, and a set of passcode-sealed cryptographic shares;
maintain a recovery vault database within a user-controlled cloud storage instance, the recovery vault database recording a set of custodian entries, wherein each custodian entry comprises a custodian identifier, a registration status, and an unrevokable flag;
receive a recovery request payload comprising a plurality of custodian approval payloads;
evaluate the recovery request payload against a quorum rule, wherein the quorum rule requires both a threshold number of total custodian approvals and at least one explicit custodian approval corresponding to a custodian entry in the recovery vault database where the unrevokable flag is set to true; and
upon satisfaction of the quorum rule, combine the cryptographic shares to reconstruct a recovery master secret, derive a decryption key from the recovery master secret, decrypt the recovery envelope to extract a public key, and re-encrypt the post-quantum identity payload under a newly supplied user passcode factor while maintaining the public key unchanged.

2. The system of claim 1, wherein the decryption key is derived by executing a SHA-256 hash function over the reconstructed recovery master secret, and wherein the recovery envelope is decrypted using AES-GCM under the derived key.

3. The system of claim 1, wherein the programmatic processing layer of an API server rejects any incoming state update request targeting a custodian entry where the unrevokable flag is set to true, preventing unauthorized revocation of protected custodians.

4. The system of claim 1, wherein each custodian approval payload comprises a version 2 zero-knowledge proof envelope encoding an inner STARK proof bound to an outer post-quantum signature under SHA3-384.

5. The system of claim 1, wherein the set of passcode-sealed cryptographic shares embedded within the portable identity file are encrypted via AES-GCM using a key derived from a user name string and the user passcode factor via PBKDF2.

6. A computer-implemented method for executing identity key migration with network succession, the method comprising:
generating, on a client application, a successor post-quantum key pair comprising a successor public key and a successor private key, wherein the successor key pair is distinct from a predecessor key pair associated with a user-controlled storage folder;
pinning a unique cloud storage folder identifier associated with the user-controlled storage folder in client credential metadata;
executing an in-place migration within the user-controlled storage folder by re-wrapping encrypted data files, direct messages, and group keys under the successor public key and updating identifier strings in index spreadsheets stored therein;
generating a lineage zero-knowledge proof dual-signed by the predecessor key pair and the successor key pair; and
registering a network succession record on a coordinating server, wherein the network succession record causes the server to reject online token authorizations and feed ingestion requests presenting the predecessor key pair while permitting local, offline decryption of historic files using the predecessor key pair.

7. The method of claim 6, further comprising re-issuing active zero-knowledge proof envelopes and re-inviting custodians recorded in a recovery vault database using the successor public key during the in-place migration.

8. The method of claim 6, wherein the successor post-quantum key pair comprises an ML-DSA-65 signing key pair and an ML-KEM-768 key encapsulation key pair.

9. The method of claim 6, further comprising renaming the user-controlled storage folder on the cloud storage instance to match a unique identifier string derived from the successor public key upon completion of the in-place migration.

10. The method of claim 6, wherein coordinating servers expose a public succession endpoint polled by third-party integrators to verify key retirement status.

11. The method of claim 6, further comprising automatically updating owned-asset references and user permissions bound to the predecessor key pair to point to the successor public key upon registration of the network succession record.

12. A computer-implemented public content aggregation system comprising:
a server-side performance cache database configured to serve public feed queries to client devices;
a reconcile module executing on a background interval; and
a user-controlled cloud storage instance hosting a user-authored public index spreadsheet, wherein the public index spreadsheet defines authoritative membership truth for public feed posts authored by a user;
wherein the reconcile module periodically authenticates into the user-controlled cloud storage instance using credential tokens, retrieves the user-authored public index spreadsheet, and purges entries from the server-side performance cache database whose unique identifiers are absent from the retrieved public index spreadsheet.

13. The system of claim 12, wherein the reconcile module detects explicit network authentication error codes returned by the user-controlled cloud storage instance during execution and skips cache processing for the associated user, preventing accidental cache purges during temporary credential disruptions.

14. The system of claim 12, wherein the reconcile module executes a total purge of all cached entries associated with the user from the performance cache database upon detecting that the public index spreadsheet has been completely removed from the user-controlled cloud storage instance.

15. The system of claim 12, wherein an explicit user deletion command dispatched through an application API updates the public index spreadsheet and triggers an immediate purge call to the performance cache database without awaiting the background interval.

16. The system of claim 12, wherein the public index spreadsheet is formatted as an XLSX spreadsheet residing within a dedicated metadata directory on a consumer cloud drive account.

17. A portable digital identity artifact stored on a computer-readable medium, the artifact comprising:
a JSON data structure encoding an identity payload encrypted via AES-GCM using a key derived from a user name and a passcode factor;
a recovery envelope encoding core identity metadata bound to a recovery master secret; and
a sealed share block encoding a set of Shamir secret shares of the recovery master secret, wherein the sealed share block is encrypted independently of the identity payload;
wherein presenting the artifact, the user name, and the passcode factor together enables decryption of the identity payload to expose post-quantum signing and encapsulation capabilities.

18. The artifact of claim 17, wherein the post-quantum signing capability comprises ML-DSA-65 and the post-quantum encapsulation capability comprises ML-KEM-768.

19. The artifact of claim 17, wherein the key derived from the user name and the passcode factor is computed using PBKDF2 with SHA-512 and at least one million iterations.

20. An integrator storage confinement system comprising:
a coordinating API server maintaining an OAuth client registry;
a user-controlled cloud storage instance hosting a dedicated integrator folder path structured as integrators/{client_id}/; and
a storage proxy enforcing path confinement rules, wherein the storage proxy restricts storage API write, read, and delete requests issued by an OAuth-registered integrator strictly to paths within the dedicated integrator folder path.

21. The system of claim 20, wherein identity zero-knowledge data point proofs are stored in a metadata spreadsheet separate from the dedicated integrator folder path and are accessible to the OAuth-registered integrator exclusively via dedicated proof API endpoints governed by a permissions sheet on the user-controlled cloud storage instance.

22. The system of claim 21, wherein the dedicated proof API endpoints return a zero-knowledge proof envelope encoding a STARK inner proof and an outer ML-DSA post-quantum signature binding a SHA3-384 digest without exposing plaintext user attributes to the OAuth-registered integrator.

23. The system of claim 20, wherein the OAuth-registered integrator acts as a broker entity mediating selective disclosure for third-party verifiers.