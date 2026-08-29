export type VerificationStatus='unverified'|'pending'|'verified'|'rejected';
export type SupportStatus='research'|'testing'|'limited_beta'|'supported'|'disabled';
export interface CreatorProfile{id:string;email:string;displayName:string;publicationName:string|null;status:'pending'|'active'|'suspended';createdAt:string;}
export interface AffiliateIdentifier{id:string;creatorId:string;networkId:string;identifierType:string;identifierHash:string;displayHint:string;verificationStatus:VerificationStatus;verifiedAt:string|null;}
export interface ProtectedReferralEvent{id:string;creatorId:string;affiliateIdentifierId:string;merchantId:string;networkId:string;occurredAt:string;protectionReason:string;policyVersion:string;checkoutValueMinor:number|null;currency:string|null;networkConfirmed:boolean;}
export interface MonetizationPolicy{version:string;globalEnabled:boolean;networkEnabled:boolean;merchantEnabled:boolean;offerEnabled:boolean;couponTestingEnabled:boolean;checkoutObservationEnabled:boolean;}
export function mayMonetize(policy:MonetizationPolicy,existingReferralDetected:boolean):boolean{return !existingReferralDetected&&policy.globalEnabled&&policy.networkEnabled&&policy.merchantEnabled&&policy.offerEnabled;}

