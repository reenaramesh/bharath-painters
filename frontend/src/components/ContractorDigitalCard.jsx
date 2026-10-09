import ContractorProfileAdapter from "./ContractorProfileAdapter";

// The authenticated profile-card response is already loaded by ProfileCard.
export default function ContractorDigitalCard({ data }) {
  return <ContractorProfileAdapter data={data} own />;
}
