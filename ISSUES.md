



[ ] GCP KMS Signer incorrectly serializes the transaction, resulting in the transactions failure

[x] Proxy server will keep retrying already processed jobs

[x] If the job is already completed, return the job data normally

[ ] When retrying job submission, change the job ID if not user provided and the job has expired

[ ] Proxy Server's Secure signers has lots of duplicate code

[ ] Reading a blob still does not work (getting not supported error, but skeptical that it is the RPC, since yet to see if work)

[X] Current implementation would allow for the payment to be double spent if they submit two requests simultaneously

[x] Remove the RPC health check from the normal RPC endpoint to reduce endpoint load