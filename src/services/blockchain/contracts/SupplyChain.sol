// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title SupplyChain
 * @dev Smart contract for tracking food supply chain on blockchain
 */
contract SupplyChain is Ownable, Pausable, ReentrancyGuard {
    
    struct Batch {
        string productId;
        string batchNumber;
        string dataHash;
        address creator;
        uint256 createdAt;
        bool verified;
        bool exists;
    }
    
    struct SupplyChainEvent {
        string batchId;
        string eventType;
        string location;
        string metadata;
        address actor;
        uint256 timestamp;
        string dataHash;
    }
    
    mapping(string => Batch) public batches;
    mapping(string => SupplyChainEvent[]) public batchEvents;
    mapping(address => bool) public authorizedActors;
    
    string[] public batchIds;
    
    event BatchCreated(
        string indexed batchId,
        string indexed productId,
        string batchNumber,
        address creator
    );
    
    event SupplyChainEventAdded(
        string indexed batchId,
        string eventType,
        address actor,
        uint256 timestamp
    );
    
    event ActorAuthorized(address indexed actor, bool authorized);
    
    modifier onlyAuthorized() {
        require(
            authorizedActors[msg.sender] || msg.sender == owner(),
            "Not authorized"
        );
        _;
    }
    
    modifier batchExists(string memory _batchId) {
        require(batches[_batchId].exists, "Batch does not exist");
        _;
    }
    
    constructor() {
        authorizedActors[msg.sender] = true;
    }
    
    /**
     * @dev Authorize or deauthorize an actor
     */
    function setActorAuthorization(address _actor, bool _authorized) 
        external 
        onlyOwner 
    {
        authorizedActors[_actor] = _authorized;
        emit ActorAuthorized(_actor, _authorized);
    }
    
    /**
     * @dev Create a new product batch
     */
    function createBatch(
        string memory _batchId,
        string memory _productId,
        string memory _batchNumber,
        string memory _dataHash
    ) 
        external 
        onlyAuthorized 
        whenNotPaused 
        nonReentrant 
    {
        require(!batches[_batchId].exists, "Batch already exists");
        require(bytes(_productId).length > 0, "Product ID required");
        require(bytes(_batchNumber).length > 0, "Batch number required");
        
        batches[_batchId] = Batch({
            productId: _productId,
            batchNumber: _batchNumber,
            dataHash: _dataHash,
            creator: msg.sender,
            createdAt: block.timestamp,
            verified: true,
            exists: true
        });
        
        batchIds.push(_batchId);
        
        emit BatchCreated(_batchId, _productId, _batchNumber, msg.sender);
    }
    
    /**
     * @dev Add a supply chain event to a batch
     */
    function addEvent(
        string memory _batchId,
        string memory _eventType,
        string memory _location,
        string memory _metadata,
        string memory _dataHash
    ) 
        external 
        onlyAuthorized 
        whenNotPaused 
        nonReentrant 
        batchExists(_batchId) 
    {
        require(bytes(_eventType).length > 0, "Event type required");
        
        SupplyChainEvent memory newEvent = SupplyChainEvent({
            batchId: _batchId,
            eventType: _eventType,
            location: _location,
            metadata: _metadata,
            actor: msg.sender,
            timestamp: block.timestamp,
            dataHash: _dataHash
        });
        
        batchEvents[_batchId].push(newEvent);
        
        emit SupplyChainEventAdded(_batchId, _eventType, msg.sender, block.timestamp);
    }
    
    /**
     * @dev Get batch information
     */
    function getBatch(string memory _batchId) 
        external 
        view 
        returns (
            string memory productId,
            string memory batchNumber,
            string memory dataHash,
            address creator,
            uint256 createdAt,
            bool verified
        ) 
    {
        require(batches[_batchId].exists, "Batch does not exist");
        
        Batch memory batch = batches[_batchId];
        return (
            batch.productId,
            batch.batchNumber,
            batch.dataHash,
            batch.creator,
            batch.createdAt,
            batch.verified
        );
    }
    
    /**
     * @dev Get events for a batch
     */
    function getBatchEvents(string memory _batchId) 
        external 
        view 
        batchExists(_batchId)
        returns (SupplyChainEvent[] memory) 
    {
        return batchEvents[_batchId];
    }
    
    /**
     * @dev Get event count for a batch
     */
    function getBatchEventCount(string memory _batchId) 
        external 
        view 
        batchExists(_batchId)
        returns (uint256) 
    {
        return batchEvents[_batchId].length;
    }
    
    /**
     * @dev Get specific event for a batch
     */
    function getBatchEvent(string memory _batchId, uint256 _eventIndex) 
        external 
        view 
        batchExists(_batchId)
        returns (
            string memory eventType,
            string memory location,
            string memory metadata,
            address actor,
            uint256 timestamp,
            string memory dataHash
        ) 
    {
        require(_eventIndex < batchEvents[_batchId].length, "Event index out of bounds");
        
        SupplyChainEvent memory eventData = batchEvents[_batchId][_eventIndex];
        return (
            eventData.eventType,
            eventData.location,
            eventData.metadata,
            eventData.actor,
            eventData.timestamp,
            eventData.dataHash
        );
    }
    
    /**
     * @dev Get total number of batches
     */
    function getBatchCount() external view returns (uint256) {
        return batchIds.length;
    }
    
    /**
     * @dev Get batch ID by index
     */
    function getBatchId(uint256 _index) external view returns (string memory) {
        require(_index < batchIds.length, "Index out of bounds");
        return batchIds[_index];
    }
    
    /**
     * @dev Verify batch integrity
     */
    function verifyBatch(string memory _batchId, string memory _expectedHash) 
        external 
        view 
        batchExists(_batchId)
        returns (bool) 
    {
        return keccak256(abi.encodePacked(batches[_batchId].dataHash)) == 
               keccak256(abi.encodePacked(_expectedHash));
    }
    
    /**
     * @dev Emergency pause function
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause function
     */
    function unpause() external onlyOwner {
        _unpause();
    }
}